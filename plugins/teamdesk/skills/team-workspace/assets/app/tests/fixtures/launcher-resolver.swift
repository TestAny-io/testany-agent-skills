import Foundation

@main
struct ResolverProbe {
    static func main() {
        do {
            let settings=CommandLine.arguments.count>2 ? try launcherConfiguration(at:URL(fileURLWithPath:CommandLine.arguments[2])) : nil
            let entry=try installedEntry(home:URL(fileURLWithPath:settings?.codexHome ?? CommandLine.arguments[1]))
            print(String(data:try JSONSerialization.data(withJSONObject:["entry":entry.path,"node":settings?.node ?? ""]),encoding:.utf8)!)
        } catch {fputs(error.localizedDescription,stderr);exit(1)}
    }
}
