import AppKit
let destination = CommandLine.arguments[1]
let image = NSImage(size:NSSize(width:1024,height:1024))
image.lockFocus()
NSColor(calibratedRed:0.10,green:0.18,blue:0.34,alpha:1).setFill()
NSBezierPath(roundedRect:NSRect(x:48,y:48,width:928,height:928),xRadius:206,yRadius:206).fill()
NSColor(calibratedRed:0.19,green:0.39,blue:0.91,alpha:1).setFill()
NSBezierPath(roundedRect:NSRect(x:170,y:170,width:684,height:684),xRadius:154,yRadius:154).fill()
let text = "T" as NSString
let attrs:[NSAttributedString.Key:Any] = [.font:NSFont.systemFont(ofSize:570,weight:.bold),.foregroundColor:NSColor.white]
let size = text.size(withAttributes:attrs)
text.draw(at:NSPoint(x:(1024-size.width)/2,y:(1024-size.height)/2+20),withAttributes:attrs)
image.unlockFocus()
let rep=NSBitmapImageRep(data:image.tiffRepresentation!)!
try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:destination))
