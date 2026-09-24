import Foundation

struct LaunchResult: Decodable { let status: String; let url: String?; let message: String }
struct LaunchFailure: LocalizedError { let message: String; var errorDescription: String? { message } }
struct LauncherConfiguration: Decodable { let node: String; let codexHome: String }

func launcherConfiguration(at file: URL? = nil) throws -> LauncherConfiguration? {
    guard let source=file ?? Bundle.main.resourceURL?.appendingPathComponent("installation.json"),
          FileManager.default.fileExists(atPath:source.path) else {return nil}
    guard let data=try? Data(contentsOf:source),
          let settings=try? JSONDecoder().decode(LauncherConfiguration.self,from:data),
          settings.node.hasPrefix("/"),settings.codexHome.hasPrefix("/") else {
        throw LaunchFailure(message:"启动器安装配置不完整，请重新运行 TeamDesk 安装程序。")
    }
    return settings
}

func recordStartup(_ phase: String, _ detail: [String:Any] = [:]) {
    let home = ProcessInfo.processInfo.environment["TEAMDESK_HOME"] ?? NSHomeDirectory()+"/Library/Application Support/TestAny/TeamDesk"
    let root = URL(fileURLWithPath:home), file = root.appendingPathComponent("launcher.log")
    do {
        try FileManager.default.createDirectory(at:root, withIntermediateDirectories:true, attributes:[.posixPermissions:0o700])
        if !FileManager.default.fileExists(atPath:file.path) { FileManager.default.createFile(atPath:file.path,contents:nil,attributes:[.posixPermissions:0o600]) }
        var row=detail; row["phase"]=phase; row["at"]=ISO8601DateFormatter().string(from:Date())
        var data=try JSONSerialization.data(withJSONObject:row,options:[.sortedKeys]); data.append(10)
        let handle=try FileHandle(forWritingTo:file); defer {try? handle.close()}
        try handle.seekToEnd(); try handle.write(contentsOf:data)
    } catch {}
}

func command(_ executable: URL, _ args: [String], environment: [String:String]? = nil, timeout: Double = 60) throws -> (Int32, Data) {
    let task=Process(), output=Pipe(), errors=FileManager.default.temporaryDirectory.appendingPathComponent("teamdesk-command-"+UUID().uuidString)
    FileManager.default.createFile(atPath:errors.path,contents:nil,attributes:[.posixPermissions:0o600])
    let errorHandle=try FileHandle(forWritingTo:errors)
    defer {try? errorHandle.close();try? FileManager.default.removeItem(at:errors)}
    task.executableURL=executable;task.arguments=args
    task.environment=environment ?? ProcessInfo.processInfo.environment
    task.standardInput=FileHandle.nullDevice;task.standardOutput=output;task.standardError=errorHandle
    try task.run()
    let deadline=DispatchWorkItem {if task.isRunning {task.terminate()}}
    DispatchQueue.global().asyncAfter(deadline:.now()+timeout,execute:deadline)
    let data=output.fileHandleForReading.readDataToEndOfFile();task.waitUntilExit();deadline.cancel()
    if task.terminationStatus != 0 {
        let errorText=(try? String(contentsOf:errors,encoding:.utf8)) ?? ""
        recordStartup("command_failed",["executable":executable.lastPathComponent,"exitCode":task.terminationStatus,"stderr":String(errorText.suffix(2000))])
    }
    return (task.terminationStatus,data)
}

// Cold startup must not call `codex plugin list`: it is not an offline file query.
// Codex currently replaces the version directory on update. Ambiguous caches
// require repair instead of silently picking a stale installation.
func installedEntry(home: URL? = nil) throws -> URL {
    let root=home ?? URL(fileURLWithPath:ProcessInfo.processInfo.environment["CODEX_HOME"] ?? NSHomeDirectory()+"/.codex")
    let cache=root.appendingPathComponent("plugins/cache").resolvingSymlinksInPath()
    let fm=FileManager.default
    let marketplaces=(try? fm.contentsOfDirectory(at:cache,includingPropertiesForKeys:nil,options:[.skipsHiddenFiles])) ?? []
    var entries:[URL]=[]
    for marketplace in marketplaces {
        let plugin=marketplace.appendingPathComponent("teamdesk")
        let versions=(try? fm.contentsOfDirectory(at:plugin,includingPropertiesForKeys:nil,options:[.skipsHiddenFiles])) ?? []
        for version in versions {
            let manifest=version.appendingPathComponent(".codex-plugin/plugin.json")
            guard fm.fileExists(atPath:manifest.path) else {continue}
            let resolved=version.resolvingSymlinksInPath()
            guard resolved.path.hasPrefix(cache.path+"/"), manifest.resolvingSymlinksInPath().path.hasPrefix(resolved.path+"/") else {
                throw LaunchFailure(message:"TeamDesk 安装文件指向插件缓存之外，请重新安装插件。")
            }
            guard let data=try? Data(contentsOf:manifest),let json=try? JSONSerialization.jsonObject(with:data) as? [String:Any],json["name"] as? String == "teamdesk",json["version"] as? String == version.lastPathComponent else {
                throw LaunchFailure(message:"TeamDesk 安装信息不完整，请重新安装插件。")
            }
            let entry=version.appendingPathComponent("skills/team-workspace/scripts/one-click.mjs")
            guard fm.fileExists(atPath:entry.path),entry.resolvingSymlinksInPath().path.hasPrefix(resolved.path+"/") else {
                throw LaunchFailure(message:"当前 TeamDesk 安装缺少启动入口，请重新安装插件。")
            }
            entries.append(entry)
        }
    }
    guard entries.count == 1 else {
        throw LaunchFailure(message:entries.isEmpty ? "未找到已安装的 TeamDesk 插件。请在 Codex 中安装 TeamDesk 后重试。" : "发现多个 TeamDesk 安装版本，无法确定启动哪一个。请在 Codex 中重新安装 TeamDesk 后重试。")
    }
    return entries[0]
}
