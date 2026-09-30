import { afterEach, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, readlink, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { candidateDigest, inspectionSandboxArgs, inspectionWritableRoots, parseBuildJson, prepareCandidateInspection, runBuildCommand, ensureBuildWorkflowWorktree } from './buildWorkflow';
import { retainBuildArtifact, readEvidenceFile, validScreenshot } from './buildArtifacts';

function imageFixture() {
  const chunk = (type: string, payload: Buffer) => {
    const content = Buffer.concat([Buffer.from(type),payload]); let crc=0xffffffff;
    for (const byte of content) { crc^=byte; for(let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
    const out=Buffer.alloc(payload.length+12); out.writeUInt32BE(payload.length); content.copy(out,4); out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4); return out;
  };
  const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=4;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,255]))),chunk('IEND',Buffer.alloc(0))]);
}
const temps: string[] = [];
afterEach(async () => { for (const dir of temps.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function directory() { const dir = await mkdtemp(path.join(os.tmpdir(), 'factory-build-runtime-')); temps.push(dir); return dir; }
async function git(cwd: string, args: string[]) { const result = await runBuildCommand(['git', ...args], cwd); if (result.code) throw new Error(result.output); return result.output.trim(); }
async function repo() {
  const dir = await directory();
  await git(dir, ['init', '-b', 'main']); await git(dir, ['config', 'user.name', 'Factory test']); await git(dir, ['config', 'user.email', 'factory@example.invalid']);
  await writeFile(path.join(dir, 'product.ts'), 'export const value = 1;\n');
  await writeFile(path.join(dir, '.gitignore'), 'node_modules/\ndist/\n');
  await git(dir, ['add', '.']); await git(dir, ['commit', '-m', 'Initial']); return dir;
}

test('agent JSON parser rejects missing malformed reports and preserves structured report', () => {
  expect(parseBuildJson('Summary\n```json\n{"complete":true}\n```').complete).toBe(true);
  expect(() => parseBuildJson('tests passed')).toThrow('required JSON');
  expect(() => parseBuildJson('```json\n{"pass":\n```')).toThrow();
});

test('bounded command records exit, output, kills timeout, and respects Pause abort', async () => {
  const dir = await directory();
  const failed = await runBuildCommand(['sh', '-c', 'echo actual-log; exit 7'], dir);
  expect(failed.code).toBe(7); expect(failed.output).toContain('actual-log');
  const start = Date.now(); const timed = await runBuildCommand(['sh', '-c', 'sleep 30'], dir, 40);
  expect(timed.timedOut).toBe(true); expect(Date.now() - start).toBeLessThan(2000);
  const controller = new AbortController(); setTimeout(() => controller.abort(), 30);
  await expect(runBuildCommand(['sh', '-c', 'sleep 30'], dir, 2000, controller.signal)).rejects.toThrow('paused');
});

test('inspection freezes full SHA in independent clone and baseline survives modified checkout/restart', async () => {
  const source = await repo(); const root = await directory(); const dest = path.join(root, 'inspect');
  const revision = await git(source, ['rev-parse', 'HEAD']);
  const first = await prepareCandidateInspection(source, dest, revision);
  expect(await git(dest, ['rev-parse', 'HEAD'])).toBe(revision);
  expect((await readFile(path.join(dest, '.git', 'config'), 'utf8'))).toContain(source);
  await chmod(path.join(dest, 'product.ts'), 0o644); await writeFile(path.join(dest, 'product.ts'), 'bad reviewer edit');
  expect(await candidateDigest(dest)).not.toBe(first.digest);
  const restored = await prepareCandidateInspection(source, dest, revision);
  expect(restored.digest).toBe(first.digest);
  expect(await readFile(path.join(source, 'product.ts'), 'utf8')).toContain('value = 1');
});

test('inspection accepts an uninitialized Gitlink and keeps its directory traversable', async () => {
  const source = await repo(); const nested = await repo(); const gitlink = '.claude/worktrees/kill-workers';
  const nestedRevision = await git(nested, ['rev-parse', 'HEAD']);
  await git(source, ['update-index', '--add', '--cacheinfo', `160000,${nestedRevision},${gitlink}`]);
  await git(source, ['commit', '-m', 'Track nested worktree']);
  const dest = path.join(await directory(), 'inspect');
  const inspected = await prepareCandidateInspection(source, dest, await git(source, ['rev-parse', 'HEAD']));
  const gitlinkDirectory = await stat(path.join(dest, gitlink));
  expect(gitlinkDirectory.isDirectory()).toBe(true);
  expect(gitlinkDirectory.mode & 0o111).not.toBe(0);
  expect(await candidateDigest(dest)).toBe(inspected.digest);
  expect((await stat(path.join(dest, 'product.ts'))).mode & 0o777).toBe(0o444);
  await chmod(path.join(dest, gitlink), 0o444);
  const resumed = await prepareCandidateInspection(source, dest, await git(source, ['rev-parse', 'HEAD']));
  expect((await stat(path.join(dest, gitlink))).mode & 0o111).not.toBe(0);
  expect(resumed.digest).toBe(inspected.digest);

  await writeFile(path.join(nested, 'product.ts'), 'export const value = 2;\n');
  await git(nested, ['add', 'product.ts']); await git(nested, ['commit', '-m', 'Next nested revision']);
  const nextRevision = await git(nested, ['rev-parse', 'HEAD']);
  await git(dest, ['update-index', '--cacheinfo', `160000,${nextRevision},${gitlink}`]);
  expect(await candidateDigest(dest)).not.toBe(inspected.digest);
});

test('Candidate digest detects tracked edits inside an initialized Gitlink', async () => {
  const source = await repo(); const nested = await repo(); const gitlink = 'nested';
  const nestedRevision = await git(nested, ['rev-parse', 'HEAD']);
  await git(source, ['update-index', '--add', '--cacheinfo', `160000,${nestedRevision},${gitlink}`]);
  await git(source, ['commit', '-m', 'Track nested repository']);
  await git(source, ['clone', '--no-hardlinks', nested, gitlink]);
  const baseline = await candidateDigest(source);
  expect(await candidateDigest(source)).toBe(baseline);
  await writeFile(path.join(source, gitlink, 'product.ts'), 'changed nested product code\n');
  expect(await candidateDigest(source)).not.toBe(baseline);
});

test('inspection hashes directory and dangling symlinks without reading their targets', async () => {
  const source = await repo();
  await symlink('.', path.join(source, 'directory-link'));
  await symlink('missing-product.ts', path.join(source, 'dangling-link'));
  await git(source, ['add', 'directory-link', 'dangling-link']); await git(source, ['commit', '-m', 'Track product links']);
  const dest = path.join(await directory(), 'inspect');
  const inspected = await prepareCandidateInspection(source, dest, await git(source, ['rev-parse', 'HEAD']));
  expect(await readlink(path.join(dest, 'directory-link'))).toBe('.');
  expect(await readlink(path.join(dest, 'dangling-link'))).toBe('missing-product.ts');
  expect(await candidateDigest(dest)).toBe(inspected.digest);
  await rm(path.join(dest, 'dangling-link')); await symlink('other-missing-product.ts', path.join(dest, 'dangling-link'));
  expect(await candidateDigest(dest)).not.toBe(inspected.digest);
});

test('writable generated directories cannot cover tracked product files', async () => {
  const source = await repo(); await mkdir(path.join(source, 'dist')); await writeFile(path.join(source, 'dist', 'tracked.ts'), 'product');
  await git(source, ['add', '-f', 'dist/tracked.ts']); await git(source, ['commit', '-m', 'Tracked output']);
  const writable = await inspectionWritableRoots(source);
  expect(writable).toContain(path.join(source, 'node_modules')); expect(writable).not.toContain(path.join(source, 'dist'));
});

test('actual macOS isolation denies product modifications while allowing generated dependencies and evidence', async () => {
  if (process.platform !== 'darwin' || !existsSync('/usr/bin/sandbox-exec')) return;
  const source = await repo(); const dest = path.join(await directory(), 'inspect');
  const inspected = await prepareCandidateInspection(source, dest, await git(source, ['rev-parse', 'HEAD']));
  const args = inspectionSandboxArgs([source, dest], inspected.evidence, await inspectionWritableRoots(dest));
  const modify = await runBuildCommand([...args, 'sh', '-c', 'echo broken > product.ts'], dest);
  expect(modify.code).not.toBe(0); expect(await candidateDigest(dest)).toBe(inspected.digest);
  const setup = await runBuildCommand([...args, 'sh', '-c', 'mkdir -p node_modules; echo dependency > node_modules/test; echo evidence > .factory-evidence/log'], dest);
  if (setup.code) throw new Error(setup.output); expect(await candidateDigest(dest)).toBe(inspected.digest);
  expect(await readFile(path.join(inspected.evidence, 'log'), 'utf8')).toContain('evidence');
  const original = await runBuildCommand([...args, 'sh', '-c', `echo bad > ${JSON.stringify(path.join(source, 'product.ts'))}`], dest);
  expect(original.code).not.toBe(0);
});

test('content-addressed artifacts survive source replacement and reject path escapes', async () => {
  const root = await directory();
  const first = await retainBuildArtifact(root, 'builds_test', '<html>revision 1</html>', 'html');
  const second = await retainBuildArtifact(root, 'builds_test', '<html>revision 2</html>', 'html');
  expect(first.path).not.toBe(second.path); expect(await readFile(first.path, 'utf8')).toContain('revision 1');
  await expect(retainBuildArtifact(root, '../other', 'secret', 'txt')).rejects.toThrow('identity');
  const evidence = path.join(root, 'evidence'); await mkdir(evidence); await writeFile(path.join(evidence, 'log'), 'actual output');
  await symlink(first.path, path.join(evidence, 'escape'));
  expect((await readEvidenceFile(evidence, 'log')).toString()).toBe('actual output');
  await expect(readEvidenceFile(evidence, 'escape')).rejects.toThrow('escapes');
  await expect(readEvidenceFile(evidence, '../outside')).rejects.toThrow();
});

test('screenshots cannot be text masquerading as image evidence', () => {
  expect(validScreenshot(Buffer.from('tests passed'))).toBe(false);
  const header = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(header); header.writeUInt32BE(300,16); header.writeUInt32BE(200,20);
  expect(validScreenshot(header)).toBe(false); const image=imageFixture(); expect(validScreenshot(image)).toBe(true); image[image.length-1]=0;expect(validScreenshot(image)).toBe(false);
});

test('recovering a Build worktree reuses durable identity after missed mailbox mark', async () => {
  const source = await repo(); const root = await directory(); const marks: object[] = [];
  const client = { mutation: async (_ref: unknown, args: object) => { marks.push(args); return null; } } as unknown as import('./mailbox/client').Mailbox;
  const identity = { accessKey: 'test' } as import('./managed').WorkerIdentity;
  const build = { _id: 'builds_recover', branch: 'build/recover' } as import('../shared/dataModel').Doc<'builds'>;
  const project = { localPath: source } as import('../shared/dataModel').Doc<'projects'>;
  const first = await ensureBuildWorkflowWorktree(root, client, identity, build, project);
  const recovered = await ensureBuildWorkflowWorktree(root, client, identity, build, project);
  expect(recovered).toBe(first); expect(await git(first, ['symbolic-ref', '--short', 'HEAD'])).toBe('build/recover');
  expect((await git(source, ['worktree', 'list'])).split('\n')).toHaveLength(2); expect(marks).toHaveLength(2);
});

import { api } from '../shared/mailboxApi';
import { mailboxForFile } from './mailbox/client';
import { runBuildWorkflowTick } from './buildWorkflow';

test('mock Sessions carry a whole Candidate through two reports, executed check, retained explanation, same PR update and observed merge', async () => {
  if (process.platform !== 'darwin' || !existsSync('/usr/bin/sandbox-exec')) return;
  const source = await repo(); const root = await directory(); const bare = path.join(root, 'remote.git');
  await git(root, ['init', '--bare', bare]); await git(source, ['remote', 'add', 'origin', bare]); await git(source, ['push', '-u', 'origin', 'main']);
  const key = 'a'.repeat(64); const client = mailboxForFile(path.join(root, 'mailbox.sqlite'));
  const serverId = await client.mutation(api.servers.register, { accessKey: key, publicKey: 'public', projectsRoot: root, name: 'test' });
  const projectId = await client.mutation(api.projects.addFolder, { name: 'Runtime test', localPath: source });
  const project = (await client.query(api.projects.get, { projectId }))!;
  const itemId = await client.mutation(api.roadmap.createItem, { projectId, kind: 'feature', title: 'Whole feature', requirements: [{ id: 'r1', text: 'Implement complete behavior', done: false }] });
  const pick = { provider: 'codex' as const, model: 'mock', effort: 'low' as const };
  const buildId = await client.mutation(api.builds.create, { roadmapItemId: itemId, checkCommand: 'test -f product.ts', agent: pick, reviewer: pick, prototypeMode: 'required' });
  const identity = { accessKey: key } as import('./managed').WorkerIdentity;
  let build = (await client.query(api.builds.get, { buildId }))!;
  const worktree = await ensureBuildWorkflowWorktree(root, client, identity, build, project);
  const cli = path.join(root, 'bin'); await mkdir(cli);
  const state = path.join(root, 'pr-state.json'); await writeFile(state, JSON.stringify({ state: 'OPEN', reviews: [], comments: [] }));
  const counter = path.join(root, 'pr-created');
  const gh = `#!/usr/bin/env bun\nimport fs from 'node:fs';\nconst args=process.argv.slice(2); const state=JSON.parse(fs.readFileSync(${JSON.stringify(state)},'utf8')); const head=Bun.spawnSync(['git','rev-parse','HEAD']).stdout.toString().trim();\nif(args[0]==='api') console.log(JSON.stringify({login:'owner'}));\nelse if(args[1]==='list') console.log(fs.existsSync(${JSON.stringify(counter)}) ? JSON.stringify([{number:1,url:'https://github.com/test/repo/pull/1',state:'OPEN',headRefOid:head}]) : '[]');\nelse if(args[1]==='create') {fs.appendFileSync(${JSON.stringify(counter)},'created\\n');console.log('https://github.com/test/repo/pull/1');}\nelse if(args[1]==='view') console.log(JSON.stringify({...state,number:1,url:'https://github.com/test/repo/pull/1',headRefOid:head,author:{login:'owner'}}));\n`;
  await writeFile(path.join(cli, 'gh'), gh, { mode: 0o755 });
  // CLI is a local fixture; no paid agents, GitHub calls, or production PRs execute.
  const oldPath = process.env.PATH; process.env.PATH = cli + path.delimiter + oldPath;
  const tick = async () => { build = (await client.query(api.builds.get, { buildId }))!; await runBuildWorkflowTick(root, client, identity, build, project, worktree); };
  const until = async (predicate: (build: import('../shared/dataModel').Doc<'builds'>) => boolean) => {
    for (let i=0;i<300;i++) { await tick(); await Bun.sleep(5); build = (await client.query(api.builds.get, { buildId }))!; if (predicate(build)) return; if(build.workflow?.status==='paused') throw new Error(build.workflow.error); }
    throw new Error(`Runtime timed out in ${build.workflow?.phase}`);
  };
  const finish = async (role: import('../shared/buildWorkflow').WorkflowRole, report: object) => {
    const stage = build.workflow!.stages[role]!; await client.mutation(api.sessions.claim, { accessKey: key, sessionId: stage.sessionId });
    await client.mutation(api.sessions.appendMessage, { sessionId: stage.sessionId, text: '```json\n'+JSON.stringify(report)+'\n```' });
    await client.mutation(api.sessions.complete, { sessionId: stage.sessionId });
  };
  const screenshots = async () => {
    const stage = build.workflow!.stages.verifier!; const view = await client.query(api.sessions.get,{sessionId:stage.sessionId});
    const evidence = path.join(view!.session.cwd!,'.factory-evidence');
    const image = imageFixture();
    await writeFile(path.join(evidence,'before.png'),image); await writeFile(path.join(evidence,'after.png'),image);
    return [{path:'before.png',title:'Before: real app',requirementId:'r1'},{path:'after.png',title:'After: real app',requirementId:'r1'}];
  };
  try {
    await until(b => !!b.workflow?.stages.planner);
    await finish('planner', {setupCommand:'mkdir -p node_modules; echo installed > node_modules/proof',checkCommands:['test -f product.ts && test -f node_modules/proof'],previewCommand:'sleep 30',verificationTargets:['web']});
    await until(b => b.workflow?.phase==='refine' && !!b.workflow.stages.planner);
    expect((await client.query(api.projects.get,{projectId}))?.buildConfig?.discovered).toBe(true);
    await finish('planner', { requirements: [{id:'r1',text:'Implement complete behavior',done:false}],needsPrototype:true,ui:true });
    await until(b => b.workflow?.phase==='prototype' && !!b.workflow.stages.prototype);
    await finish('prototype',{html:'<!doctype html><html><button>Initial</button></html>',summary:'Does anything need changing?'});
    await until(b => b.workflow?.phase==='prototypeReview');
    const initialPrototype = build.workflow!.prototypeRevisions.at(-1)!;
    await client.mutation(api.builds.action,{buildId,action:{id:'prototype-revise',generation:build.workflow!.generation,phase:'prototypeReview',kind:'requestRevision',revision:initialPrototype.id,text:'Change button label'}});
    await until(b => b.workflow?.phase==='prototype' && !!b.workflow.stages.prototype);
    await finish('prototype',{html:'<!doctype html><html><button>Revised</button></html>',summary:'Any further changes?'});
    await until(b => b.workflow?.phase==='prototypeReview');
    expect(build.workflow!.prototypeRevisions).toHaveLength(2); expect(build.workflow!.batch.attempts).toBe(0);
    expect(await readFile(build.workflow!.artifacts.find(a => a.id===initialPrototype.artifactId)!.path,'utf8')).toContain('Initial');
    await client.mutation(api.builds.action,{buildId,action:{id:'prototype-approve',generation:build.workflow!.generation,phase:'prototypeReview',kind:'approvePrototype',revision:build.workflow!.prototypeRevisions.at(-1)!.id}});
    await until(b => b.workflow?.phase==='plan'  && !!b.workflow.stages.planner);
    await finish('planner', { checkpoints: [{ title:'Complete feature',description:'All behavior',tests:'Required deterministic check',ui:false }] });
    await until(b => b.workflow?.phase==='build' && !!b.workflow.stages.builder);
    expect(build.workflow!.batch.attempts).toBe(1);
    await writeFile(path.join(worktree, 'product.ts'), 'export const value = 2;\n'); await finish('builder', {complete:true,summary:'Whole plan implemented'});
    await until(b => b.workflow?.phase==='verify' && !!b.workflow.stages.verifier && !!b.workflow.stages.reviewer);
    const revision = build.workflow!.candidateRevision!;
    await finish('verifier', {revision,pass:true,findings:[],requirements:[{requirementId:'r1',pass:true,evidence:'Executed actual whole feature behavior'}],screenshots:await screenshots()});
    await finish('reviewer', {revision,pass:false,findings:[{id:'style',severity:'suggestion',text:'Prefer shorter name',evidence:'product.ts:1',impact:'Readability'}],requirements:[],screenshots:[]});
    await until(b => b.workflow?.phase==='publish' && !!b.workflow.stages.prototype);
    expect(build.workflow!.reports.verifier?.checks[0]?.exitCode).toBe(0);
    expect(build.workflow!.reports.verifier?.revision).toBe(revision); expect(build.workflow!.reports.reviewer?.revision).toBe(revision);
    await finish('prototype', {html:'<!doctype html><html><button onclick="this.textContent=\'Value 2\'">Behavior</button></html>'});
    await until(b => b.workflow?.phase==='prReview');
    expect(build.workflow!.pr?.number).toBe(1); expect(build.workflow!.artifacts.some(a => a.kind==='visualExplanation')).toBe(true);
    expect((await readFile(counter,'utf8')).trim()).toBe('created'); expect(build.workflow!.batch.attempts).toBe(1);
    // Explicit changes reuse the same PR and authorize a new Batch; ordinary comments do not.
    await client.mutation(api.builds.action,{buildId,action:{id:'user-changes',generation:build.workflow!.generation,phase:'prReview',kind:'requestChanges',text:'Match accepted behavior',changesDesign:false}});
    await until(b => b.workflow?.phase==='plan' && !!b.workflow.stages.planner);
    expect(build.workflow!.pr?.number).toBe(1); expect(build.workflow!.batch.number).toBe(2);
    await finish('planner',{checkpoints:[{title:'Match behavior',description:'Implement requested behavior',tests:'check',ui:false}]});
    await until(b => b.workflow?.phase==='build' && !!b.workflow.stages.builder);
    await writeFile(path.join(worktree,'product.ts'),'export const value = 3;\n'); await finish('builder',{complete:true});
    await until(b => b.workflow?.phase==='verify' && !!b.workflow.stages.verifier && !!b.workflow.stages.reviewer);
    const revised = build.workflow!.candidateRevision!;
    await finish('verifier',{revision:revised,pass:true,findings:[],requirements:[{requirementId:'r1',pass:true,evidence:'Executed revised feature'}],screenshots:await screenshots()});
    await finish('reviewer',{revision:revised,pass:true,findings:[],requirements:[],screenshots:[]});
    await until(b => b.workflow?.phase==='publish' && !!b.workflow.stages.prototype); await finish('prototype',{html:'<!doctype html><html><button>Value 3</button></html>'});
    await until(b => b.workflow?.phase==='prReview'); expect(build.workflow!.pr?.number).toBe(1); expect((await readFile(counter,'utf8')).trim()).toBe('created');
    // Merge is observed, never requested by the Worker.
    await writeFile(state,JSON.stringify({state:'MERGED',reviews:[],comments:[]}));
    await syncBuildPullRequest(client,identity,build,true);
    expect((await client.query(api.roadmap.getItem,{itemId}))?.status).toBe('done');
    expect(serverId).toBeTruthy();
  } finally { process.env.PATH=oldPath; }
}, 30_000);

async function runtimeFixture(config: import('../shared/buildWorkflow').BuildConfigurationOverride = {}) {
  const source = await repo(); const root = await directory(); const key='f'.repeat(64); const client=mailboxForFile(path.join(root,'state.sqlite'));
  await client.mutation(api.servers.register,{accessKey:key,publicKey:'public',projectsRoot:root,name:'offline fixture'});
  const projectId=await client.mutation(api.projects.addFolder,{name:'Fixture',localPath:source}); const project=(await client.query(api.projects.get,{projectId}))!;
  const itemId=await client.mutation(api.roadmap.createItem,{projectId,kind:'feature',title:'Bounded attempts',requirements:[{id:'r',text:'Whole feature',done:false}]});
  const pick={provider:'codex' as const,model:'mock',effort:'low' as const};
  const buildId=await client.mutation(api.builds.create,{roadmapItemId:itemId,checkCommand:'true',agent:pick,reviewer:pick,prototypeMode:'skip',config:{discovered:true,...config}});
  const identity={accessKey:key} as import('./managed').WorkerIdentity; let build=(await client.query(api.builds.get,{buildId}))!;
  const worktree=await ensureBuildWorkflowWorktree(root,client,identity,build,project);
  const get=async()=>{build=(await client.query(api.builds.get,{buildId}))!;return build;};
  const until=async(predicate:(b:typeof build)=>boolean)=>{for(let i=0;i<300;i++){await get();await runBuildWorkflowTick(root,client,identity,build,project,worktree);await Bun.sleep(5);await get();if(predicate(build))return build;}throw new Error('Bounded fixture timeout');};
  const finish=async(role:import('../shared/buildWorkflow').WorkflowRole,report:object)=>{await get();const sessionId=build.workflow!.stages[role]!.sessionId;await client.mutation(api.sessions.claim,{accessKey:key,sessionId});await client.mutation(api.sessions.appendMessage,{sessionId,text:JSON.stringify(report)});await client.mutation(api.sessions.complete,{sessionId});return sessionId;};
  return {get,until,finish,client,buildId,identity};
}

test('three incomplete whole builders consume exactly three slots; Pause and Resume preserve the active slot', async()=>{
  const f=await runtimeFixture();
  await f.until(b=>!!b.workflow?.stages.planner);await f.finish('planner',{requirements:[{id:'r',text:'Whole feature',done:false}],needsPrototype:false,ui:false});
  await f.until(b=>b.workflow?.phase==='plan'&&!!b.workflow.stages.planner);await f.finish('planner',{checkpoints:[{title:'Whole plan',description:'All work',tests:'true',ui:false}]});
  let build=await f.until(b=>b.workflow?.phase==='build'&&!!b.workflow.stages.builder);const first=build.workflow!.stages.builder!.sessionId;
  await f.client.mutation(api.builds.action,{buildId:f.buildId,action:{id:'pause',generation:build.workflow!.generation,phase:'build',kind:'pause'}});
  expect(await f.client.query(api.sessions.getStatus,{sessionId:first})).toBe('stopped');build=await f.get();expect(build.workflow!.batch.attempts).toBe(1);
  await f.client.mutation(api.builds.action,{buildId:f.buildId,action:{id:'resume',generation:build.workflow!.generation,phase:'build',kind:'resume'}});
  build=await f.until(b=>b.workflow?.phase==='build'&&!!b.workflow.stages.builder);expect(build.workflow!.stages.builder!.sessionId).not.toBe(first);expect(build.workflow!.batch.attempts).toBe(1);
  for(let attempt=1;attempt<=3;attempt++){
    await f.finish('builder',{complete:false,summary:'Incomplete whole plan'});
    build=await f.until(b=>attempt===3?b.workflow?.status==='paused':b.workflow?.phase==='build'&&!!b.workflow.stages.builder&&b.workflow.batch.attempts===attempt+1);
  }
  expect(build.workflow!.batch.attempts).toBe(3);expect(build.workflow!.blocker).toBe('budget');const sessions=build.workflow!.sessionIds.length;
  await f.until(b=>b.workflow?.status==='paused');expect((await f.get()).workflow!.sessionIds).toHaveLength(sessions);
  await f.client.mutation(api.builds.action,{buildId:f.buildId,action:{id:'continue',generation:build.workflow!.generation,phase:'build',kind:'continue'}});
  build=await f.until(b=>b.workflow?.status==='running'&&!!b.workflow.stages.builder);expect(build.workflow!.batch.number).toBe(2);expect(build.workflow!.batch.attempts).toBe(1);
});

test('actual recorded token ceiling pauses and stops an active role instead of publishing or resetting budget',async()=>{
  const f=await runtimeFixture({tokenCeiling:5});let build=await f.until(b=>!!b.workflow?.stages.planner);const sessionId=build.workflow!.stages.planner!.sessionId;
  await f.client.mutation(api.sessions.claim,{accessKey:f.identity.accessKey,sessionId});
  await f.client.mutation(api.sessions.recordUsage,{sessionId,usage:{inputTokens:6,outputTokens:4,cacheReadTokens:0,cacheWriteTokens:0,reasoningTokens:0,totalTokens:10}});
  build=await f.until(b=>b.workflow?.status==='paused');expect(build.workflow!.tokens).toBe(10);expect(build.workflow!.blocker).toBe('resource');expect(await f.client.query(api.sessions.getStatus,{sessionId})).toBe('stopped');
});

import { startSessionBridge } from './sessionBridge';
import { recoverBuildWorkflows, sessionExecutionEnvironment, syncBuildPullRequest } from './buildWorkflow';

test('read-only subprocess cannot read Worker authority or reach Worker aliases, but its own reporting bridge works',async()=>{
  if(process.platform!=='darwin'||!existsSync('/usr/bin/sandbox-exec'))return;
  const source=await repo();const inspected=await prepareCandidateInspection(source,path.join(await directory(),'inspect'),await git(source,['rev-parse','HEAD']));
  const secret=path.join(source,'worker.json');await writeFile(secret,'household-secret');
  const main=Bun.serve({hostname:'0.0.0.0',port:0,fetch:()=>new Response('household API')});
  const client={query:async()=> 'running',mutation:async()=>null} as unknown as import('./mailbox/client').Mailbox;
  const bridge=startSessionBridge(client,'own');
  try{
    const args=inspectionSandboxArgs([source,inspected.cwd],inspected.evidence,[],{secretPaths:[secret],workerPorts:[main.port!]});
    const secretRead=await runBuildCommand([...args,'cat',secret],inspected.cwd);expect(secretRead.code).not.toBe(0);expect(secretRead.output).not.toContain('household-secret');
    for(const alias of ['127.0.0.1','127.0.0.2']){
      const script=`try{await fetch(${JSON.stringify(`http://${alias}:${main.port}/pair`)});process.exit(1)}catch{process.exit(0)}`;
      const denied=await runBuildCommand([...args,process.execPath,'-e',script],inspected.cwd,3000);expect(denied.code).toBe(0);expect(denied.timedOut).toBe(false);
    }
    const allowed=await runBuildCommand([...args,process.execPath,'-e',`const result=await fetch(${JSON.stringify(bridge.workerUrl+'/api/query')},{method:'POST',headers:{authorization:${JSON.stringify('Bearer '+bridge.token)}},body:JSON.stringify({path:'sessions.getStatus',args:{sessionId:'own'}})});console.log(await result.text());process.exit(result.status===200?0:1)`],inspected.cwd,3000);
    expect(allowed.code).toBe(0);expect(allowed.output).toContain('running');
    const builderWorktree=path.join(source,'intended-build-worktree');await mkdir(builderWorktree);await writeFile(path.join(builderWorktree,'product.ts'),'initial builder product');
    const builderArgs=inspectionSandboxArgs([source],inspected.evidence,[builderWorktree],{secretPaths:[secret],workerPorts:[main.port!]});
    const productEdit=await runBuildCommand([...builderArgs,'sh','-c','echo builder-change > product.ts'],builderWorktree);expect(productEdit.code).toBe(0);
    const originalEdit=await runBuildCommand([...builderArgs,'sh','-c','echo unauthorized > product.ts'],source);expect(originalEdit.code).not.toBe(0);
    const builderSecret=await runBuildCommand([...builderArgs,'cat',secret],source);expect(builderSecret.code).not.toBe(0);
    const secretOverwrite=await runBuildCommand([...builderArgs,'sh','-c',`echo changed > ${JSON.stringify(secret)}`],source);expect(secretOverwrite.code).not.toBe(0);
    const builderNetwork=await runBuildCommand([...builderArgs,process.execPath,'-e',`try{await fetch(${JSON.stringify('http://127.0.0.2:'+main.port+'/pair')});process.exit(1)}catch{process.exit(0)}`],source,3000);expect(builderNetwork.code).toBe(0);
    expect(sessionExecutionEnvironment({FACTORY_ACCESS_KEY:'private',FACTORY_PAIR_TOKEN:'household',HOUSEHOLD_TOKEN:'household',OPENAI_API_KEY:'provider',PATH:'path'})).toEqual({OPENAI_API_KEY:'provider',PATH:'path'});
  }finally{bridge.close();main.stop(true);}
});

test('Worker restart visibly pauses running durable stage and preserves its consumed Candidate slot',async()=>{
  const f=await runtimeFixture();await f.until(b=>!!b.workflow?.stages.planner);await f.finish('planner',{requirements:[{id:'r',text:'Whole feature',done:false}],needsPrototype:false,ui:false});
  await f.until(b=>b.workflow?.phase==='plan'&&!!b.workflow.stages.planner);await f.finish('planner',{checkpoints:[{title:'Whole work',description:'Full behavior',tests:'true',ui:false}]});
  let build=await f.until(b=>b.workflow?.phase==='build'&&!!b.workflow.stages.builder);const sessionId=build.workflow!.stages.builder!.sessionId;
  await f.client.mutation(api.sessions.claim,{accessKey:f.identity.accessKey,sessionId});await recoverBuildWorkflows(f.client,f.identity);build=await f.get();
  expect(build.workflow!.status).toBe('paused');expect(build.workflow!.blocker).toBe('interrupted');expect(build.workflow!.batch.attempts).toBe(1);expect(await f.client.query(api.sessions.getStatus,{sessionId})).toBe('stopped');
});
