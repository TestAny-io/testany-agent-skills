import AppKit
import Foundation

func launch(codex: URL) throws -> LaunchResult {
    let settings=try launcherConfiguration()
    let candidates = [ProcessInfo.processInfo.environment["TEAMDESK_NODE"],codex.appendingPathComponent("Contents/Resources/cua_node/bin/node").path,settings?.node,"/opt/homebrew/bin/node","/usr/local/bin/node"].compactMap {$0}
    let node = candidates.first(where: {
        guard FileManager.default.isExecutableFile(atPath: $0) else { return false }
        let probe = try? command(URL(fileURLWithPath:$0), ["--input-type=module", "-e", "import {DatabaseSync} from 'node:sqlite'; const [a,b]=process.versions.node.split('.').map(Number); if(a<22 || (a===22 && b<13))process.exit(1);"], timeout:5)
        return probe?.0 == 0
    })
    guard let node = node else {
        throw LaunchFailure(message: "未找到 Node.js。请安装 Node.js 22.13 或更高版本，或修复 Codex 安装。")
    }
    var env = ProcessInfo.processInfo.environment
    if env["CODEX_HOME"] == nil, let codexHome=settings?.codexHome {env["CODEX_HOME"]=codexHome}
    let entry = try installedEntry(home:env["CODEX_HOME"].map {URL(fileURLWithPath:$0)})
    env["TEAMDESK_CODEX_APP"] = codex.path; env["TEAMDESK_NODE"] = node
    let helper = Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/launch-codex")
    guard FileManager.default.isExecutableFile(atPath:helper.path) else { throw LaunchFailure(message:"启动器组件不完整，请重新安装 TeamDesk 图标。") }
    env["TEAMDESK_DESKTOP_LAUNCHER"] = helper.path
    recordStartup("entry_resolved", ["entry":entry.path, "codex":codex.path])
    let (code, data) = try command(URL(fileURLWithPath: node), [entry.path], environment: env, timeout:90)
    guard let result = try? JSONDecoder().decode(LaunchResult.self, from: data) else {
        throw LaunchFailure(message: "TeamDesk 启动未完成，请重试。若仍失败，请检查工作台数据目录中的 launcher.log。")
    }
    recordStartup("workspace_result",["status":result.status,"message":result.message])
    guard code == 0, result.status != "error" else { throw LaunchFailure(message: result.message) }
    return result
}

final class LauncherDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow?
    var busy = false
    func applicationDidFinishLaunching(_ notification: Notification) { start() }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if busy { window?.makeKeyAndOrderFront(nil) } else { start() }; return true
    }
    func start() {
        guard !busy else { return }; busy = true
        guard let codex = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.openai.codex") else {
            finishError("未找到 Codex Desktop。请先安装并正常打开一次 Codex。"); return
        }
        guard let safari = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Safari") else {
            finishError("未找到 Safari，请检查本机 Safari 安装。"); return
        }
        let view = NSView(frame: NSRect(x:0,y:0,width:440,height:150))
        let title = NSTextField(labelWithString:"正在打开 TeamDesk")
        title.font = .boldSystemFont(ofSize:20); title.frame = NSRect(x:28,y:96,width:385,height:30); view.addSubview(title)
        let detail = NSTextField(wrappingLabelWithString:"启动本地工作台，连接 Codex Desktop，随后在 Safari 打开。")
        detail.font = .systemFont(ofSize:13); detail.textColor = .secondaryLabelColor
        detail.frame = NSRect(x:28,y:43,width:385,height:43); view.addSubview(detail)
        let progress = NSProgressIndicator(frame:NSRect(x:28,y:21,width:385,height:12))
        progress.style = .bar; progress.isIndeterminate = true; progress.startAnimation(nil); view.addSubview(progress)
        let panel = NSWindow(contentRect:view.frame, styleMask:[.titled], backing:.buffered, defer:false)
        panel.title = "TeamDesk"; panel.contentView = view; panel.center(); panel.makeKeyAndOrderFront(nil)
        window = panel; NSApp.activate(ignoringOtherApps:true)
        DispatchQueue.global(qos:.userInitiated).async {
            do {
                let result = try launch(codex:codex)
                DispatchQueue.main.async { self.showCodexThenSafari(result, codex:codex, safari:safari) }
            } catch {
                DispatchQueue.main.async { self.finishError(error.localizedDescription) }
            }
        }
    }
    func showCodexThenSafari(_ result:LaunchResult,codex:URL,safari:URL) {
        guard !NSRunningApplication.runningApplications(withBundleIdentifier:"com.openai.codex").isEmpty else {openSafari(result,safari:safari);return}
        let config=NSWorkspace.OpenConfiguration();config.activates=true;config.hides=false;config.createsNewApplicationInstance=false
        NSWorkspace.shared.openApplication(at:codex,configuration:config) { application,error in
            DispatchQueue.main.async {
                recordStartup("codex_window_requested",["pid":application?.processIdentifier ?? 0,"error":error?.localizedDescription ?? ""])
                if let error=error {self.openSafari(LaunchResult(status:"window_warning",url:result.url,message:"工作台可以打开，但 Codex 窗口显示失败："+error.localizedDescription),safari:safari)}
                else {self.openSafari(result,safari:safari)}
            }
        }
    }
    func openSafari(_ result: LaunchResult, safari: URL) {
        guard let text = result.url, let url = URL(string:text), url.scheme == "http", url.host == "127.0.0.1", url.port != nil, url.user == nil, url.password == nil else {
            finishError("启动器收到的工作台地址不合法。"); return
        }

        let config = NSWorkspace.OpenConfiguration(); config.activates = true
        NSWorkspace.shared.open([url], withApplicationAt:safari, configuration:config) { _, error in
            DispatchQueue.main.async {
                self.window?.orderOut(nil)
                if let error = error { self.finishError("Safari 打开失败："+error.localizedDescription); return }
                recordStartup("safari_opened", ["status":result.status, "url":url.absoluteString])
                if result.status != "connected" { self.alert("TeamDesk 已在 Safari 打开", result.message) }
                NSApp.terminate(nil)
            }
        }
    }
    func alert(_ title: String, _ text: String) {
        NSApp.activate(ignoringOtherApps:true)
        let alert = NSAlert(); alert.messageText = title; alert.informativeText = text; alert.addButton(withTitle:"知道了"); alert.runModal()
    }
    func finishError(_ message: String) { recordStartup("failed", ["message":message]); window?.orderOut(nil); alert("TeamDesk 启动未完成",message); NSApp.terminate(nil) }
}

@main
struct TeamDeskMain {
    static let delegate = LauncherDelegate()
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory); app.delegate = delegate; app.run()
    }
}
