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
  var children: [Process] = []
  var root: URL

  init(root: URL) {
    self.root = root
    super.init()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    item.button?.title = "F"
    let menu = NSMenu()
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
    start(["bun", "worker/index.ts"])
    start(["bun", "--cwd", "expo", "start", "--web"])
  }

  func start(_ arguments: [String]) {
    let process = Process()
    process.currentDirectoryURL = root
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    process.arguments = arguments
    process.environment = processEnv()
    process.standardOutput = FileHandle.standardOutput
    process.standardError = FileHandle.standardError
    try? process.run()
    children.append(process)
  }

  func processEnv() -> [String: String] {
    var env = ProcessInfo.processInfo.environment
    let extra = "\(NSHomeDirectory())/.bun/bin:/opt/homebrew/bin"
    env["PATH"] = "\(extra):\(env["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin")"
    return env
  }

  func stopChildren() {
    for process in children { process.terminate() }
    children.removeAll()
  }

  @objc func openFactory() {
    NSWorkspace.shared.open(URL(string: "http://localhost:8081")!)
  }

  @objc func openSettings() {
    NSWorkspace.shared.open(URL(string: "http://localhost:8081/settings")!)
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
    startServices()
  }

  @objc func quit() {
    stopChildren()
    NSApp.terminate(nil)
  }

  func enableLoginItem() {
    // ponytail: LSSharedFileList is enough for a local .app; SMAppService if we ship notarized.
    let app = Bundle.main.bundleURL.path
    guard app.hasSuffix(".app") || app.hasSuffix(".app/") else { return }
  }

  func applicationWillTerminate(_ notification: Notification) {
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
