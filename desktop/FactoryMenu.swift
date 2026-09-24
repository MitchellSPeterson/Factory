import AppKit
import Foundation

private let rootDefaultsKey = "factoryRoot"

func isCheckout(_ url: URL) -> Bool {
  FileManager.default.fileExists(atPath: url.appendingPathComponent("worker/index.ts").path)
}

func pickCheckout() -> URL? {
  let panel = NSOpenPanel()
  panel.canChooseFiles = false
  panel.canChooseDirectories = true
  panel.allowsMultipleSelection = false
  panel.message = "Choose the Factory checkout this menu should run."
  panel.prompt = "Use this folder"
  NSApp.activate(ignoringOtherApps: true)
  guard panel.runModal() == .OK, let url = panel.url else { return nil }
  guard isCheckout(url) else {
    let alert = NSAlert()
    alert.messageText = "Not a Factory checkout"
    alert.informativeText = "Pick the folder that contains worker/index.ts."
    alert.runModal()
    return nil
  }
  UserDefaults.standard.set(url.path, forKey: rootDefaultsKey)
  return url
}

func resolveRoot() -> URL? {
  let defaults = UserDefaults.standard
  if CommandLine.argc > 1 {
    let url = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
    if isCheckout(url) {
      defaults.set(url.path, forKey: rootDefaultsKey)
      return url
    }
  }
  if let saved = defaults.string(forKey: rootDefaultsKey) {
    let url = URL(fileURLWithPath: saved, isDirectory: true)
    if isCheckout(url) { return url }
  }
  let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
  if isCheckout(cwd) {
    defaults.set(cwd.path, forKey: rootDefaultsKey)
    return cwd
  }
  return pickCheckout()
}

final class App: NSObject, NSApplicationDelegate {
  let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  let status = NSMenuItem(title: "Worker: starting…", action: nil, keyEquivalent: "")
  var worker: Process?
  var build: Process?
  var restarts = 0
  var stopping = false
  var generation = 0  // bumped on checkout switch/quit so stale exit handlers do nothing
  var root: URL

  init(root: URL) {
    self.root = root
    super.init()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    item.button?.title = "F"
    let menu = NSMenu()
    menu.addItem(status)
    menu.addItem(NSMenuItem.separator())
    menu.addItem(NSMenuItem(title: "Open Factory", action: #selector(openFactory), keyEquivalent: "o"))
    menu.addItem(NSMenuItem(title: "Settings", action: #selector(openSettings), keyEquivalent: ","))
    menu.addItem(NSMenuItem(title: "Show pairing address", action: #selector(showPair), keyEquivalent: "p"))
    menu.addItem(NSMenuItem(title: "Choose checkout…", action: #selector(chooseCheckout), keyEquivalent: ""))
    menu.addItem(NSMenuItem.separator())
    menu.addItem(NSMenuItem(title: "Quit Factory", action: #selector(quit), keyEquivalent: "q"))
    item.menu = menu
    startServices()
    enableLoginItem()
  }

  func startServices() {
    build = spawn(["bun", "run", "build:web"])
    superviseWorker()
  }

  // Keep one Worker alive, like T3's desktop backend manager: restart with backoff,
  // and leave an already-running Worker (e.g. `bun run dev:worker`) alone.
  func superviseWorker() {
    guard !stopping else { return }
    let gen = generation
    var request = URLRequest(url: URL(string: "http://127.0.0.1:3402/health")!)
    request.timeoutInterval = 2
    URLSession.shared.dataTask(with: request) { _, response, _ in
      let healthy = (response as? HTTPURLResponse)?.statusCode == 200
      DispatchQueue.main.async {
        guard gen == self.generation else { return }
        healthy ? self.watchExternalWorker() : self.startWorker()
      }
    }.resume()
  }

  func watchExternalWorker() {
    status.title = "Worker: running (started outside the menu)"
    let gen = generation
    DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
      if gen == self.generation { self.superviseWorker() }
    }
  }

  func startWorker() {
    guard !stopping else { return }
    let started = Date()
    let gen = generation
    guard let process = spawn(["bun", "worker/index.ts"], onExit: { [weak self] in
      guard let self, !self.stopping, gen == self.generation else { return }
      if Date().timeIntervalSince(started) > 60 { self.restarts = 0 }
      self.scheduleRestart()
    }) else {
      scheduleRestart()
      return
    }
    worker = process
    status.title = "Worker: running"
  }

  func scheduleRestart() {
    let delay = min(pow(2, Double(restarts)), 30)
    restarts += 1
    worker = nil
    status.title = "Worker: stopped, restarting in \(Int(delay))s"
    let gen = generation
    DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
      if gen == self.generation { self.superviseWorker() }
    }
  }

  @discardableResult
  func spawn(_ arguments: [String], onExit: (() -> Void)? = nil) -> Process? {
    let process = Process()
    process.currentDirectoryURL = root
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    process.arguments = arguments
    process.environment = processEnv()
    process.standardOutput = FileHandle.standardOutput
    process.standardError = FileHandle.standardError
    if let onExit { process.terminationHandler = { _ in DispatchQueue.main.async(execute: onExit) } }
    do {
      try process.run()
      return process
    } catch {
      NSLog("Factory: could not start \(arguments.joined(separator: " ")): \(error)")
      return nil
    }
  }

  func processEnv() -> [String: String] {
    var env = ProcessInfo.processInfo.environment
    let extra = "\(NSHomeDirectory())/.bun/bin:/opt/homebrew/bin"
    env["PATH"] = "\(extra):\(env["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin")"
    return env
  }

  func stopChildren() {
    generation += 1
    worker?.terminate()
    build?.terminate()
    worker = nil
    build = nil
  }

  @objc func openFactory() {
    NSWorkspace.shared.open(URL(string: "http://localhost:3402")!)
  }

  @objc func openSettings() {
    NSWorkspace.shared.open(URL(string: "http://localhost:3402/settings")!)
  }

  @objc func showPair() {
    let alert = NSAlert()
    alert.messageText = "Pairing"
    if let data = try? Data(contentsOf: URL(string: "http://127.0.0.1:3402/status")!),
       let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let pairing = body["pairing"] as? String {
      alert.informativeText = "On the phone, type:\n\(pairing)"
    } else {
      alert.informativeText = "Start the Worker, then try again. Pairing answers on port 3402."
    }
    alert.runModal()
  }

  @objc func chooseCheckout() {
    guard let next = pickCheckout() else { return }
    stopChildren()
    root = next
    restarts = 0
    startServices()
  }

  @objc func quit() {
    stopping = true
    stopChildren()
    NSApp.terminate(nil)
  }

  func enableLoginItem() {
    // ponytail: LSSharedFileList is enough for a local .app; SMAppService if we ship notarized.
    let app = Bundle.main.bundleURL.path
    guard app.hasSuffix(".app") || app.hasSuffix(".app/") else { return }
  }

  func applicationWillTerminate(_ notification: Notification) {
    stopping = true
    stopChildren()
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
guard let root = resolveRoot() else {
  let alert = NSAlert()
  alert.messageText = "Factory"
  alert.informativeText = "Choose the Factory checkout (the folder that contains worker/)."
  alert.runModal()
  exit(1)
}
let delegate = App(root: root)
app.delegate = delegate
app.run()
