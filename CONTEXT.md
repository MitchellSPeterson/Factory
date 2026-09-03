# Factory

A personal control plane for running Cursor agents across your product repos. You sit here. Agents do the work.

## Language

**Project**:
A single git repository you develop, including a monorepo that contains Expo and web together. A Project may name one Recipe used for new Jobs.
_Avoid_: App, workspace, product

**Recipe**:
An ordered list of Stages used to take a Job from request to a pull request. You can keep more than one Recipe and copy one to start another.
_Avoid_: Pipeline, workflow, playbook, template

**Stage**:
A named phase of a Recipe. Each Stage has a key, title, Bindings, optional model and effort, and an optional halt that waits for a human before the next Stage. Keys `plan`, `implement`, `verify`, and `pr` keep their engine behavior; other keys run then continue.
_Avoid_: Step, phase, task

**Skill**:
Factory-owned markdown whose body is what the agent sees for a Stage.
_Avoid_: Prompt, instruction, rule, cursor skill

**Binding**:
The assignment of one Skill to one Stage, with an optional Gate.
_Avoid_: Attachment, hook, plugin

**Gate**:
A named condition that decides whether a Binding is included. v1 has one name: largeAndThinSpec.
_Avoid_: Rule, predicate, filter, expression

**Job**:
One request against one Project, executed through one Recipe.
_Avoid_: Ticket, task, issue, work item

**View all**:
The Jobs board with no Project restriction; every Job is visible regardless of Project.
_Avoid_: All projects, everything, global view

**Project scope**:
The Jobs board limited to Jobs belonging to one chosen Project.
_Avoid_: Filter, workspace, context switch

**Lane**:
The Job's place on the board. The seven lanes are Queued, Needs Grilling, Planning, Plan Review, Building, Code Review, and PR.
_Avoid_: Column, status, swimlane

**Run**:
One agent execution of one Stage of a Job.
_Avoid_: Session, attempt, launch

**Ask**:
A pending human-in-the-loop round on a Run. The agent asked. You answer in the Factory.
_Avoid_: Prompt, question set, interview, HITL

**Artifact**:
A durable output of a Stage. v1 kinds are plan_verdict, spec, and pr_url.
_Avoid_: Output, result, document

**Plan verdict**:
The structured Artifact that records whether the request is large or small and whether the spec is thin or enough.
_Avoid_: Assessment, triage, score
