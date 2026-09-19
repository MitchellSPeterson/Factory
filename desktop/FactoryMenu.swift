import AppKit
import Foundation

final class App: NSObject, NSApplicationDelegate {
  let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  var worker: Process?
  let root: URL

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
    menu.addItem(NSMenuItem.separator())
    menu.addItem(NSMenuItem(title: "Quit Factory", action: #selector(quit), keyEquivalent: "q"))
    item.menu = menu
    startWorker()
    enableLoginItem()
  }

  func startWorker() {
    let process = Process()
    process.currentDirectoryURL = root
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    process.arguments = ["bun", "worker/index.ts"]
    process.standardOutput = FileHandle.standardOutput
    process.standardError = FileHandle.standardError
    try? process.run()
    worker = process
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

  @objc func quit() {
    worker?.terminate()
    NSApp.terminate(nil)
  }

  func enableLoginItem() {
    // ponytail: LSSharedFileList is enough for a local .app; SMAppService if we ship notarized.
    let app = Bundle.main.bundleURL.path
    guard app.hasSuffix(".app") || app.hasSuffix(".app/") else { return }
  }

  func applicationWillTerminate(_ notification: Notification) {
    worker?.terminate()
  }
}

let root = URL(fileURLWithPath: CommandLine.argc > 1 ? CommandLine.arguments[1] : FileManager.default.currentDirectoryPath)
let app = NSApplication.shared
let delegate = App(root: root)
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
