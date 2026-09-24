import AppKit
import Foundation

// A local launcher component, called by one-click.mjs with two validated paths.
// LaunchServices sends the normal open-application event as well as the per-run
// environment; directly spawning the Mach-O is insufficient to ensure a window.
@main
struct LaunchCodex {
    static func main() {
        guard CommandLine.arguments.count == 3 else { fail("共享启动参数不完整。"); return }
        let app=URL(fileURLWithPath:CommandLine.arguments[1]),wrapper=CommandLine.arguments[2]
        guard Bundle(url:app)?.bundleIdentifier == "com.openai.codex",FileManager.default.isExecutableFile(atPath:wrapper) else {fail("Codex 应用或共享接入器无效。");return}
        guard NSRunningApplication.runningApplications(withBundleIdentifier:"com.openai.codex").isEmpty else {fail("Codex 已在运行，请先正常退出后再使用共享启动。");return}
        let options=NSWorkspace.OpenConfiguration()
        options.activates=true;options.hides=false;options.createsNewApplicationInstance=false
        options.environment=["CODEX_CLI_PATH":wrapper,"CODEX_APP_SERVER_FORCE_CLI":"1"]
        // Hooks must use the same selected runtime and data/profile directories
        // as TeamDesk, including when Finder starts without the user's shell env.
        for key in ["CODEX_HOME","TEAMDESK_NODE","TEAMDESK_HOME"] {
            if let value=ProcessInfo.processInfo.environment[key] {options.environment[key]=value}
        }
        NSWorkspace.shared.openApplication(at:app,configuration:options) { application,error in
            if let error=error {fail("无法打开 Codex："+error.localizedDescription);return}
            guard let application=application else {fail("macOS 未返回 Codex 启动进程。");return}
            let data=try! JSONSerialization.data(withJSONObject:["started":true,"pid":application.processIdentifier])
            FileHandle.standardOutput.write(data);FileHandle.standardOutput.write(Data([10]));exit(0)
        }
        RunLoop.main.run()
    }
    static func fail(_ message:String) {
        let data=try! JSONSerialization.data(withJSONObject:["error":message]);FileHandle.standardOutput.write(data);FileHandle.standardOutput.write(Data([10]));exit(1)
    }
}
