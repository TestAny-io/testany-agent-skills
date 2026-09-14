"""Neutral business inputs, separate from the frozen behavioral expectations."""

import json
import zipfile
from pathlib import Path


RUNTIME = "00000000-0000-4000-8000-000000000001"
PLATFORM_PROFILES = {"chain", "query", "mismatch", "upload_failure", "workspace"}
SCRIPT = '''def test_billing_total():
    amounts = [120, 80, 50]
    assert sum(amounts) == 250
'''
BRD = """# OldPortal 业务需求草稿

文档 ID：BRD-ACCESS；版本：0.1；状态：草稿，尚未业务批准。
业务 Owner：林远；运营负责人：周宁；测量负责人：陈禾。
目标用户：内部员工（申请人）、部门主管（审批人）、运营管理员。
背景：当前通过邮件申请内部工具访问权，进度依赖人工追问，决定无法统一追溯。
目标：让申请、主管决定和处理记录可追踪；不承诺未经测量的收益数字。
范围：创建申请、查看本人申请、主管同意或拒绝、通知结果、运营查询决定记录。
不做：自动开通第三方权限、采购付款、外部客户账号、多级审批和移动端原生应用。
约束：仅公司账号；主管只能处理所属部门申请；员工只能查看本人申请。
历史量化基线：尚未采集；现有访谈是定性观察，不是实测统计。
估算：尚无经验证的量化收益估算。

## 测量计划
陈禾在试点开始前登记样本范围和观察窗口，记录邮件申请的提交时间、首次决定时间、
补充材料次数与是否有可追溯决定；上线后以同一口径记录试点申请。
申请到决定的耗时按同一工作日口径比较，分别披露样本数、缺失数据和异常值处理；
仅比较同部门同类型申请，不能把未观测结果写成已达到目标。
林远在基线采集完成后与运营共同确认数值目标；当前数值目标待测后制定。

## 离散验收
AC-01：员工提交完整申请后，可在本人列表中看到唯一申请编号与待审批状态。
AC-02：主管同意或拒绝后，申请人看到对应结果；拒绝必须展示理由。
AC-03：非本人且非本部门主管无法读取或处理该申请。
AC-04：运营可根据申请编号检索操作者、时间、原状态和新状态。
AC-05：失败通知保留待发送记录，不能把未发送的消息标为已送达。
交付边界：本轮产出草稿，最终批准仍由林远另行作出。
"""
MATERIALS = BRD.replace("# OldPortal 业务需求草稿", "# AccessPortal 已整理业务材料") + """

## 资料来源与实施考虑
来源：林远与周宁整理的内部流程访谈纪要，未附历史耗时数据。
优先级：申请、本人查询、主管决定、授权隔离和审计为 P0；运营筛选为 P1。
实施依赖：现有公司账号目录提供员工与部门主管关系；由 IT 联系人宋青负责目录接入。
风险：主管目录不完整导致无法路由，先提示申请人联系运营修复目录，不自动改审批人。
交付顺序：先做内部试点，依据离散验收记录和测量结果由 Owner 决定是否扩展。
无批准记录、无已完成试点记录、无实测收益数字。
"""
JOURNEYS = """# AccessPortal 旅程材料

资料已整理；本次整理输出尚未批准。沿用 BRD-ACCESS 的角色、边界、负责人和测量计划。
现状：申请人邮件提出访问请求，主管邮件决定，运营人工归档；不存在已测量的耗时基线。
未来旅程之间共享申请编号；以下优先级与流程已由业务材料明确，不是待确认问题。

## UJ-01 提交申请（P0，申请人）
触发：已登录员工需要一个内部工具的访问权。前置：账号有效且部门和主管可解析。
1. 从入口选择工具，填写用途并检查已有待审批申请。
2. 提交后显示申请编号和待审批状态；进入 UJ-02。
3. 员工可从本人列表进入详情查看状态；完成后进入 UJ-03 的结果展示。
必填缺失：就地提示并保留输入，不生成申请。
主管目录缺失：提示联系运营修复目录，保留草稿，不擅自指定其他主管。
重复待审批申请：跳转已有申请详情，不重复提交。
网络失败：保留输入并展示未提交状态，不假称成功。
成功结束：唯一申请已进入所属主管队列；审计记录提交事件，流向 UJ-04。

## UJ-02 主管处理（P0，部门主管）
触发：所属部门有新待审批申请。前置：主管身份有效且申请仍待审批。
1. 在部门队列打开申请，读取用途和申请人信息。
2. 同意或填写拒绝理由后提交决定。
3. 服务保存决定和操作者、时间、原状态、新状态，进入 UJ-03，并记录 UJ-04 审计事件。
无权处理：拒绝访问，不泄露其他部门信息。
同时已被处理：显示当前决定，不覆盖它，不生成第二次决定。
拒绝时缺少理由：就地提示补齐，仍保持待审批状态。
成功结束：申请是已同意或已拒绝；系统不自动开通第三方权限。

## UJ-03 结果送达（P0，申请人及运营）
触发：UJ-02 已保存决定。前置：决定记录存在。
1. 在申请详情展示同意或拒绝结果及拒绝理由。
2. 通过公司内通知发送结果；成功后记录送达时间。
3. 通知失败时保留待发送记录，运营处理发送故障；申请决定本身不回滚。
成功结束：本人可读取决定，通知送达或明确待发送；处理事件流向 UJ-04。
拒绝后的再次申请：{resubmit}

## UJ-04 运营追溯（审计 P0，筛选 P1，运营管理员）
触发：运营需追溯一项申请。前置：运营角色已授权。
1. 输入申请编号，读取提交、决定和通知的操作者、时间和状态变化。
2. 可按工具和申请状态筛选，不暴露凭证或跨角色个人数据。
3. 无匹配时展示空结果；读取失败时展示未加载，不展示伪造记录。
成功结束：只读追溯完成，不改变申请决定，也不授予权限。
主管离岗时尚未决定的申请：{absent}

## 跨旅程约束
UJ-01 -> UJ-02 -> UJ-03；前三者的事件进入 UJ-04。
按申请编号和已落库状态关联，不依赖通知已送达；无自动第三方权限开通步骤。
性能数值待 BRD 测量计划执行后确定，不影响本草稿整理。除下述标记外没有待定分支。
"""


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(value, bytes):
        path.write_bytes(value)
    else:
        path.write_text(value, encoding="utf-8")


def write_json(path, value):
    write(path, json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def metadata():
    return {
        "name": "Verify billing total", "runtime_uuid": RUNTIME,
        "is_private": True, "workspace_keys": ["LAB"],
        "description": "验证本地静态金额之和；前置条件：无，不调用外部系统。",
        "case_labels": ["billing", "smoke"], "environments": ["lab"],
        "case_meta": {
            "trigger_method": {
                "executor": "pyres",
                "trigger_command": ["python", "-m", "pytest", "test_billing.py", "-q"],
            },
            "environment_variables": [],
        },
    }


def package(work, bad=False):
    meta = metadata()
    members = {"test_billing.py": SCRIPT}
    if bad:
        meta["case_meta"]["trigger_method"]["trigger_command"][3] = "missing_entry.py"
        members["broken_helper.py"] = "def calculate_total(:\n    return 250\n"
    write_json(work / "metadata.json", meta)
    with zipfile.ZipFile(work / "package.zip", "w", zipfile.ZIP_DEFLATED) as bundle:
        for name, content in members.items():
            info = zipfile.ZipInfo(name, date_time=(2026, 9, 14, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, content)


def manifest_examples(work):
    parent = work / "practice repositories"
    for label in ("01-version", "02-components", "03-link"):
        root = parent / label
        plugin = root / "plugins/example"
        entry = {"name": "example", "source": "./plugins/example"}
        config = {"name": "example", "description": "Local fixture plugin"}
        if label == "01-version":
            entry["version"] = "1.0.0"
            config["version"] = "1.0.0"
        elif label == "02-components":
            entry.update({"strict": False, "skills": ["./skills/sample"]})
            config["skills"] = ["./skills/sample"]
        write_json(root / ".claude-plugin/marketplace.json", {
            "name": "practice-" + label, "owner": {"name": "Internal Lab"},
            "plugins": [entry],
        })
        write_json(plugin / ".claude-plugin/plugin.json", config)
        write(plugin / "skills/sample/SKILL.md", "---\nname: sample\ndescription: 练习资料检索\n---\n# Sample\n仅练习资料。\n")
        if label == "03-link":
            outside = parent / "shared material" / "sample"
            write(outside / "SKILL.md", "---\nname: linked-sample\ndescription: 练习链接资料\n---\n# Linked sample\n")
            (plugin / "skills/linked").symlink_to("../../../../shared material/sample", target_is_directory=True)
    write(work / "repositories.md", "# 本地审查对象\n\n待审查的三个独立 marketplace 根目录：\n"
          "- `practice repositories/01-version`\n- `practice repositories/02-components`\n"
          "- `practice repositories/03-link`\n\n这些是输入配置，不是 SKILLS.md 所列的可用技能安装。\n")


def materialize(case, root):
    work = root / "workspace"
    work.mkdir()
    profile, case_id = case["profile"], case["id"]
    if profile in {"chain", "upload_failure", "bad_package"} or case_id == "D02":
        package(work, bad=profile == "bad_package")
    if case_id == "A02":
        write(work / "test_billing.py", SCRIPT)
        write(work / "materials.md", "# 单个原子测试步骤\n验证静态金额 120、80、50 之和为 250。\n"
              "名称 Verify billing total；标签 billing、smoke；无外部依赖、凭证、环境输入或 relay。\n"
              "目标运行环境 cloudprime / lab，runtime_uuid: " + RUNTIME + "；Python 推荐 pyres；未来如注册则为 LAB 私有 case。\n"
              "本轮只产出本地交付，不执行脚本。\n")
    if profile == "brd_edit":
        write(work / "BRD.md", BRD)
    if profile == "brd_synthesis":
        write(work / "materials.md", MATERIALS)
    if profile in {"journey_gaps", "journey_complete"}:
        write(work / "BRD.md", BRD.replace("OldPortal", "AccessPortal"))
        if profile == "journey_gaps":
            resubmit = "待定分支 Q1：修改原申请重新提交，还是创建关联原编号的新申请？"
            absent = "待定分支 Q2：等待主管归岗，还是由运营转交预先登记的代理主管？"
        else:
            resubmit = "创建关联原申请编号的新申请，保留原拒绝记录，进入 UJ-01，不覆盖历史。"
            absent = "运营转交目录中预先登记的代理主管并记录转交事件，仍由 UJ-02 决定；未登记代理则保留待审批并提示运营修复目录。"
        write(work / "journey-materials.md", JOURNEYS.format(resubmit=resubmit, absent=absent))
    if profile == "local_edit":
        write(work / "notes.md", "# Skil notes\n\nThis paragraph must stay unchanged.\n\nVersion: 0.1.0\n")
    if profile == "manifest":
        manifest_examples(work)
