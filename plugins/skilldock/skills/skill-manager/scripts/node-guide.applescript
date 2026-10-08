-- SPDX-License-Identifier: AGPL-3.0-only
-- Guidance when no usable Node.js is found (HLD 3.10). Runs in its own process so the
-- caller returns at once. Arguments: the command that "重新检测" runs again (passed to
-- /usr/bin/env, e.g. KEY=VALUE pairs, /bin/sh, the launcher and its arguments).
on run argv
	set choice to button returned of (display dialog "SkillDock 需要 Node.js 22.12 或更新版本，本机没有找到可用的 Node.js。" & return & return & "安装后点“重新检测”，或重新打开 SkillDock。也可以用环境变量 SKILLDOCK_NODE_BIN 指定 Node 的绝对路径。" buttons {"取消", "重新检测", "打开 Node.js 下载页"} default button "打开 Node.js 下载页" cancel button "取消" with title "SkillDock" with icon caution giving up after 900)
	if choice is "打开 Node.js 下载页" then
		open location "https://nodejs.org/zh-cn/download"
	else if choice is "重新检测" then
		set command to "/usr/bin/env"
		repeat with value in argv
			set command to command & " " & quoted form of (value as text)
		end repeat
		do shell script command & " >/dev/null 2>&1 &"
	end if
end run
