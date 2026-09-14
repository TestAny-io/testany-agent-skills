# 第二轮 UAT 变更有界独立复核

结论：**本轮明确范围通过，开放 P0/P1：0，发现的 P2 已修复。** 日期：2026-09-14。可随 root 整合验证交用户再次验收；本记录不是用户 UAT 通过证明。

## 范围与依据

按用户「周期改为小时」和「关联来源为什么没有元数据」反馈，只读审查 `UpdatesWorkspace.tsx/css`、`SourceProvenance.tsx`、`App.tsx` 的计划成功提示及相应三语字典，核对三个受影响的浏览器测试文件与共享契约。没有改作者实现、后端、用户安装或真实计划，也没有重跑无变更的后端完整测试。

来源事实采用 `11-source-metadata-findings.md` 的本机调查；其中 27 个普通副本的枚举证据归该调查作者所有。本审查者另独立核对官方安装脚本的 SHA-256 与 `_copy_skill` / `main` 实际代码：报告中的摘要一致，选定技能目录通过 `copytree` 复制，临时仓库随后清理，当前脚本没有另写仓库、ref 或安装 commit 的来源登记。本结论没有利用名称或内容相似度推断历史来源。

## 审查结果

| 项目 | 结论与证据 |
|---|---|
| 小时显示与分钟契约 | 预设 1/24/168 小时分别提交 60/1440/10080 分钟；自定义字段保持小时单位，wire 与持久化仍是整数分钟，未更改已有调度语义 |
| 旧计划精度 | 独立提取实际转换函数，仅剥除 TypeScript 类型，穷举 15–10080 的全部 10,066 个整数分钟，分钟→小时字符串→分钟均与原值相同；浏览器验证旧 15、61 分钟计划保存后不变 |
| 输入与计划范围 | 0.25–168 小时且换算为整数分钟才提交；1.1 小时保存为 66 分钟。越界、空输入及真正的非整数分钟在发请求前拒绝；保存保留目标、开关、autoApply 与时区，不自动启用计划或加入新目标 |
| 三语与界面 | 中文、英语、日语控件、错误和提示与小时单位一致；390px 页面与弹窗无横向溢出。成功提示使用服务实际返回的 schedule 生成小时说明，不凭表单猜保存结果 |
| 来源为空 | 无记录时四个字段明确显示未记录，表单保持空白并解释原因；没有生成仓库地址或安装 commit |
| Git 来源证据 | 有 origin 与无 origin 的真实临时 Git 工作区均预填可用来源/目录，展示 HEAD；明确当前 HEAD 不能证明原安装 commit，保留未提交文件内容不变 |

发现并关闭 P2：原 `SourceProvenance` 将所有 `sourceType=local` 的目录、ref、commit 显示为「不适用」。但无 origin 的 Git 工作区仍具有 HEAD/ref，普通本地来源也可能有有效 subpath。修复后优先识别 `kind=git-checkout`，来源内目录独立显示；浏览器中的无 origin 反例已通过。未知信息仍不补造。

## 独立执行结果

- `uat-round2.spec.ts` 与 `uat-source-context.spec.ts`：**11/11 通过，36.4 秒**。
- `uat-round1.spec.ts --grep 'update forms|update inventory'`：**4/4 通过，4.5 秒**。
- 实际转换函数：10,066 个旧值往返、5 个小数/预设样本、8 个无效输入均通过。

浏览器复验使用独立 4823 端口与临时 home/state，输出位于 `/tmp/skilldock-r2-independent-e2e`、`/tmp/skilldock-r2-independent-regression`；没有覆盖 root 的默认 E2E 结果。Git fixture 只在临时目录中初始化和设置示例 origin，没有 fetch/pull、安装真实来源或修改真实计划。仅设置 origin 地址不构成来源真实性证明。

## 候选摘要与交接

以下九个对象在浏览器验证前后 SHA-256 一致：`src/UpdatesWorkspace.tsx`、`src/UpdatesWorkspace.css`、`src/SourceProvenance.tsx`、`src/App.tsx`、`src/i18n/server-messages.json`、`tests/uat-round1.spec.ts`、`tests/uat-round2.spec.ts`、`tests/uat-source-context.spec.ts`、`shared/contracts.ts`。相对根为 `assets/app`；集合摘要按加上 `assets/app/` 前缀后的路径排序，依次输入路径、NUL、原始字节、NUL。

集合 SHA-256：`fd62f76b08d0c5915aaf02c2984efbe744763ada18ba0959d970db41433414e5`

旧的非整小时计划可能显示较长的小数，这是保留整数分钟精度的表现。后端原始历史记录仍保留原文；本轮没有迁移历史记录或改变循环执行时间规则。原安装记录未保存时，界面无法凭现存文件恢复历史 commit，用户确认关联建立的是后续更新来源。最终整合与用户验收由对应交付记录继续完成。
