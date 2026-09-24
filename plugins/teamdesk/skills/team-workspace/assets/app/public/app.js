import { taskProgress, matchesTaskProgress, taskAcceptance } from "./task-progress.js";
import { workspaceUI } from "./workspace-ui.js";
import { writingUI } from './writing-ui.js';
import { employeeModelsUI } from './employee-models.js';
import { collaborationProgress } from './collaboration.js';
import { connectionDetails } from './connection-ui.js';
import { deliveryProgress, deliveryDetails } from './delivery.js';
import { collaborationUI } from './collaboration-ui.js';
const $ = (s) => document.querySelector(s),
  dialog = $("#dialog");
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const pages = {
  overview: "团队总览",
  employees: "员工",
  departments: "部门",
  resources: "团队资料",
  tasks: "任务",
  messages: "协作消息",
  collaboration: "协作视图",
  records: "共享记录",
  decisions: "待你决定",
  rules: "团队设置",
};
const labels = {
  unregistered: "业务信息待补齐",
  executing: "执行中",
  awaiting_record: "本轮已结束 · 待工作记录",
  execution_unknown: "已开工 · 待确认进展",
  queued: "等待开始",
  in_progress: "推进中",
  waiting_input: "等待输入",
  blocked: "受阻",
  completed: "负责人报告完成",
  collaboration_pending: '负责人报告完成 · 协作待完成',
  awaiting_acceptance: "待验收",
  accepted_complete: "已完成（验收通过）",
  cancelled: "已取消",
  saved: "已保存 · 等待投递",
  native_accepted: "原生已接受",
  native_queued: "已进入 Codex 队列",
  sending: "正在送入 Codex",
  answering: "回答已提交 · 等待原生回执",
  closed: "原生请求已结束",
  received: "原生已接收",
  recorded: "本轮已记账",
  pending: "待处理",
  leased: "原生执行中",
  uncertain: "结果待核对",
  failed: "执行失败",
  done: "原生已回执",
  paused: "已暂停",
  superseded: "旧绑定已替代",
  task_started: "原生执行中",
  task_complete: "本轮已结束",
  turn_aborted: "本轮中断",
  not_observed: "尚未观察到轮次",
  owner_report: "负责人报告",
  contributor_report: "协作者报告",
  acceptance_receipt: "验收通知回执",
  resolved: "已决定",
  needs_info: "待补充",
  accepted: "已通过",
  rejected: "未通过",
  native_tool: "原生工具调用",
  native_message: "原生接收",
  "decision.resolved": "作出产品决定",
  "decision.needs_info": "要求补充信息",
  "task.accepted": "人类验收通过",
  "task.rejected": "退回负责人整改",
};
function readRoute() {
  const [page, query = ""] = location.hash.slice(1).split("?", 2);
  return { page: pages[page] ? page : "overview", filter: new URLSearchParams(query).get("filter") };
}
const initialRoute = readRoute();
let S,
  token,
  route = initialRoute.page,
  filters = initialRoute.page === "tasks" && initialRoute.filter ? { select: initialRoute.filter } : {},
  catalogCache,
  skillCache,
  mobile = false,
  submitting = false,
  lastFocus,
  lastSignature;
const name = (id) =>
  S.employees.find((e) => e.id === id)?.name || id || "原生接入";
const threadName = (id) =>
  S.employees.find((e) => e.threadId === id)?.name ||
  (id === S.settings.bridgeThreadId ? "原生接入任务" : id?.slice(0, 12) || "—");
const time = (v) =>
  v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "—";
const tag = (v, color = "") =>
  '<span class="pill ' + color + '">' + esc(labels[v] || v) + "</span>";
const native = (id) =>
  id
    ? '<a class="native-link" href="codex://threads/' +
      encodeURIComponent(id) +
      '">在 Codex 中打开 ↗</a>'
    : '<span class="muted">等待绑定</span>';
const btn = (label, action, id = "", primary = false) =>
  '<button type="' +
  (action === "submit" ? "submit" : "button") +
  '" class="btn' +
  (primary ? " primary" : "") +
  '" data-action="' +
  action +
  '" data-id="' +
  esc(id) +
  '">' +
  label +
  "</button>";
const soon = (label) =>
  '<button class="btn" data-action="soon" data-id="' +
  esc(label) +
  '" title="Coming soon">' +
  esc(label) +
  "</button>";
const empty = (title, text, action = "") =>
  '<div class="empty-state"><h3>' +
  esc(title) +
  "</h3><p>" +
  esc(text) +
  '</p><div class="spacer">' +
  action +
  "</div></div>";
const heading = (title, subtitle, actions = "") =>
  '<div class="page-heading"><div><h1>' +
  esc(title) +
  "</h1><p>" +
  esc(subtitle) +
  '</p></div><div class="actions">' +
  actions +
  "</div></div>";
const panel = (title, body, actions = "") =>
  '<section class="panel section-gap"><div class="panel-header"><h2>' +
  esc(title) +
  "</h2>" +
  actions +
  "</div>" +
  body +
  "</section>";
function field(title, html, hint = "") {
  return (
    '<label class="field"><span>' +
    esc(title) +
    "</span>" +
    html +
    (hint ? "<small>" + esc(hint) + "</small>" : "") +
    "</label>"
  );
}
function opts(values, selected) {
  return values
    .map(
      ([value, text]) =>
        '<option value="' +
        esc(value) +
        '"' +
        (value === selected ? " selected" : "") +
        ">" +
        esc(text) +
        "</option>",
    )
    .join("");
}
function status(t) {
  const view = taskProgress(t, S);
  return tag(
    view.state,
    ["completed"].includes(view.state)
      ? "green"
      : ["blocked", "waiting_input", "turn_aborted", "execution_unknown", "awaiting_record"].includes(view.state)
        ? "amber"
        : "blue",
  );
}
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("visible");
  setTimeout(() => $("#toast").classList.remove("visible"), 4500);
}
async function api(url, input, key) {
  const r = await fetch(
    url,
    input === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-TeamDesk-Token": token,
            "Idempotency-Key": key || crypto.randomUUID(),
          },
          body: JSON.stringify(input),
        },
  );
  const j = await r.json();
  if (!r.ok) throw Error(j.message || "请求失败");
  return j;
}
const workspace = workspaceUI({ state: () => S, filters: () => filters, esc, tag, btn, heading, panel, field, opts, empty, matched, filterbar, show, api, time, name });
const writer = writingUI({dialog,api,esc,toast,state:()=>S});
const employeeModels = employeeModelsUI({state:()=>S,dialog,api,show,esc,time,toast,refresh});
const coView = collaborationUI({state:()=>S,api,esc,time,native,heading});
const departments = () => workspace.departments(), resources = () => workspace.resources();
async function refresh(renderPage = true, reconnect = false) {
  const data = await api(S && !reconnect ? "/api/state" : "/api/bootstrap");
  if (data.token) token = data.token;
  const signature = JSON.stringify({
    ...data,
    at: undefined,
    token: undefined,
  });
  const changed = signature !== lastSignature;
  S = data;
  await writer.refresh();
  employeeModels.refresh();
  lastSignature = signature;
  if (
    renderPage &&
    changed &&
    !dialog.open &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
  )
    render();
}
function render() {
  if (!S) return;
  coView.preserve();
  route = pages[route] ? route : "overview";
  const pending = S.decisions.filter((d) => !["resolved", "closed"].includes(d.state)).length;
  $("#app").innerHTML =
    '<aside class="sidebar ' +
    (mobile ? "mobile-open" : "") +
    '" aria-label="主导航"><button class="icon-button mobile-sidebar-close" data-action="mobile" aria-label="关闭导航">×</button><div class="brand"><span class="brand-mark">T</span><div><div class="brand-name">TestAny</div><div class="brand-sub">TEAMDESK · LOCAL</div></div></div><div class="workspace-card"><span class="avatar">AI</span><div><strong>' +
    esc(S.settings.teamName) +
    '</strong><p>现有 Codex · 直接协作</p></div></div><nav class="nav">' +
    Object.entries(pages)
      .map(
        ([id, label]) =>
          '<a class="nav-item ' +
          (route === id ? "active" : "") +
          '" href="#' +
          id +
          '" ' +
          (route === id ? 'aria-current="page"' : "") +
          "><span>" +
          label +
          "</span>" +
          (id === "decisions" && pending
            ? '<span class="badge-num">' + pending + "</span>"
            : "") +
          "</a>",
      )
      .join("") +
    '</nav><div class="sidebar-bottom"><div class="sidebar-note">32 位员工 · 任意业务流程</div><div class="profile"><span class="avatar">你</span><div><strong>产品经理</strong><p>人类决策与验收</p></div></div></div></aside><div class="app-body"><header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" data-action="mobile" aria-label="打开导航">☰</button><span>AI 团队</span><span>›</span><strong>' +
    pages[route] +
    '</strong></div><div class="top-actions"><button class="search-trigger" data-action="search" aria-label="查找任务或员工"><span>查找任务或员工</span><kbd>⌘ K</kbd></button><span class="pill green">本机真实数据</span></div></header><main class="main" id="main" tabindex="-1">' +
    banner() +
    { overview, employees, departments, resources, tasks, messages, collaboration:coView.page, records, decisions, rules }[
      route
    ]() +
    "</main></div>";
  coView.mount().catch(error=>toast(error.message));
}
function banner() {
  if (!S.settings.enabled)
    return '<div class="status-banner">团队接入已暂停。已保存数据保留；员工原有工作继续由 Codex 管理。 <a href="#rules">管理接入</a></div>';
  if (!S.health.nativeAvailable)
    return (
      '<div class="status-banner">原生索引暂不可用：' +
      esc(S.health.nativeError) +
      '。已保存数据不受影响。 <a href="#rules">检查连接</a></div>'
    );
  if (!S.health.connection?.online)
    return '<div class="status-banner">原生接入尚未就绪或暂时离线。新输入会保存，恢复连接后投递。 <a href="#rules">完成接入</a></div>';
  if (S.health.recovery && S.health.recovery.state !== 'ready')
    return '<div class="status-banner">已连接 Codex，'+(S.health.recovery.state === 'partial' ? '部分员工的状态尚待恢复。':'正在恢复员工状态与回执。')+'输入会保存，核验后再投递。 <a href="#rules">查看恢复进度</a></div>';
  if (!S.health.hookTrust.recorded) return '<div class="status-banner">自动记账尚未就绪，输入会保存。<button class="text-link" data-action="review-hook">审查共享 hook</button></div>';
  return "";
}
function taskTable(list, activeOnly = false) {
  return list.length
    ? '<div class="table-wrap"><table><thead><tr><th>任务 / 编号</th><th>负责人</th><th>类别 / 阶段</th><th>状态</th><th>人类验收</th></tr></thead><tbody>' +
        list
          .map(
            (t) =>
              '<tr><td><button class="text-link row-action" data-action="task" data-id="' +
              t.id +
              '">' +
              esc(taskProgress(t, S).title) +
              '</button><div class="mono">' +
              esc(t.businessId || t.id.slice(0, 13)) +
              "</div>" +
              (!t.businessId
                ? '<div class="muted smalltext">名称与业务编号待负责人确认</div>'
                : "") +
              "</td><td>" +
              esc(name(t.ownerEmployeeId)) +
              "</td><td>" +
              esc(t.category || "待负责人填写") +
              '<div class="muted smalltext">' +
              esc(taskProgress(t, S).stage) +
              "</div></td><td>" +
              status(t) +
              "</td><td>" +
              acceptance(t) +
              "</td></tr>",
          )
          .join("") +
        "</tbody></table></div>"
    : empty(
        !S.tasks.length
          ? "还没有业务任务"
          : activeOnly
            ? "当前没有进行中的任务"
            : "没有符合条件的任务",
        !S.tasks.length
          ? "指定负责人并说明目标，负责人会建立业务编号和名称。"
          : activeOnly
            ? "历史任务与交付记录仍可在「全部任务」查看。"
            : "调整搜索或筛选条件，查看其他任务。",
        !S.tasks.length || activeOnly
          ? btn("新建任务", "new-task", "", true)
          : "",
      );
}
function acceptance(t) {
  return t.acceptance && t.acceptance.revision === t.revision
    ? tag(
        t.acceptance.verdict,
        t.acceptance.verdict === "accepted" ? "green" : "amber",
      )
    : tag(t.acceptance ? "证据已更新 · 待重新验收" : "未验收");
}
function overview() {
  const active = S.employees.filter((e) => !e.archived),
    pending = S.decisions.filter((d) => !["resolved", "closed"].includes(d.state));
  const stats = [
    ["团队员工", active.length + "/32", "按需扩充岗位与部门", "employees"],
    [
      "推进中的任务",
      S.tasks.filter((t) => taskProgress(t, S).bucket === "working").length,
      "原生执行与负责人进度",
      "tasks",
      "in_progress",
    ],
    [
      "等待开始",
      S.tasks.filter((t) => taskProgress(t, S).bucket === "waiting").length,
      "FIFO 与 steer 由员工原生处理",
      "tasks",
      "queued",
    ],
    ["待验收", S.tasks.filter(t => taskAcceptance(t, S) === "awaiting_acceptance").length, "负责人已交付，等待你验收", "tasks", "awaiting_acceptance"],
    ["已完成", S.tasks.filter(t => taskAcceptance(t, S) === "accepted_complete").length, "当前交付版本已验收通过", "tasks", "accepted_complete"],
    ["需要你的决定", pending.length, "明确产品规则，帮助员工继续", "decisions"],
  ];
  return (
    heading(
      "团队工作台",
      "关注工作进展，在需要时作出决定",
      btn("查看员工", "nav", "employees") +
        btn("新建任务", "new-task", "", true),
    ) +
    '<section class="stats overview-stats">' +
    stats
      .map(
        ([label, value, foot, page, filter]) =>
          '<button class="stat" data-action="' + (filter ? "task-filter" : "nav") + '" data-id="' +
          (filter || page) +
          '"><div class="stat-label">' +
          label +
          '</div><div class="stat-value">' +
          value +
          '</div><div class="stat-foot">' +
          foot +
          "</div></button>",
      )
      .join("") +
    '</section><div class="cols"><div>' +
    panel(
      "进行中的工作",
      taskTable(
        S.tasks
          .filter((t) => taskProgress(t, S).bucket !== "finished")
          .slice(-10)
          .reverse(),
        true,
      ),
      '<a href="#tasks">全部任务 →</a>',
    ) +
    panel(
      "员工近况",
      '<div class="card-body flow">' +
        (active.length
          ? active
              .slice(0, 8)
              .map(
                (e) =>
                  '<button class="btn" data-action="employee" data-id="' +
                  e.id +
                  '">' +
                  esc(e.name) +
                  " " +
                  (e.hookReady ? "✓" : "·") +
                  "</button>",
              )
              .join("")
          : empty(
              "从第一位员工开始",
              "复用现有 Codex 任务，或创建新任务。",
              btn("添加员工", "new-employee", "", true),
            )) +
        "</div>",
    ) +
    "</div><div>" +
    panel(
      "需要你的决定",
      pending.length
        ? pending
            .slice(0, 4)
            .map(
              (d) =>
                '<article class="decision-card"><h3>' +
                esc(d.title) +
                '</h3><p class="muted smalltext">' +
                esc(d.question) +
                '</p><div class="spacer">' +
                btn("查看并决定", "decision", d.id) +
                "</div></article>",
            )
            .join("")
        : empty(
            "当前没有待决定事项",
            "员工遇到需要产品判断的问题时会在这里提出。",
          ),
    ) +
    panel(
      "最近工作记录",
      recordCards(S.records.slice(-3).reverse(), true),
      '<a href="#records">查看全部 →</a>',
    ) +
    "</div></div>"
  );
}
function filterbar(placeholder, options = []) {
  return (
    '<div class="filterbar"><input id="filter-search" aria-label="' +
    placeholder +
    '" placeholder="' +
    placeholder +
    '" value="' +
    esc(filters.search || "") +
    '">' +
    (options.length
      ? '<select id="filter-select" aria-label="筛选">' +
        opts(options, filters.select || "all") +
        "</select>"
      : "") +
    btn("筛选", "filter") +
    "</div>"
  );
}
function matched(value) {
  return (
    !filters.search ||
    value.toLowerCase().includes(filters.search.toLowerCase())
  );
}
function employees() {
  const list = S.employees.filter(
    (e) =>
      (filters.select === "archived"
        ? e.archived
        : !e.archived &&
          (filters.select === "all" ||
            !filters.select ||
            (filters.select === 'unassigned' && !e.departmentId) ||
            e.departmentId === filters.select)) &&
      matched(e.name + " " + e.id + " " + e.role),
  );
  const groups = S.departments.filter(d => !d.archived);
  return (
    heading(
      "团队员工",
      S.employees.filter((e) => !e.archived).length +
        " 位在职员工 · 长期身份，可更换原生任务",
      btn("管理部门", "nav", "departments") + soon("批量管理") + btn("添加员工", "new-employee", "", true),
    ) +
    filterbar("搜索员工、岗位或编号", [
      ["all", "全部在职员工"],
      ['unassigned', '未分配部门'],
      ...groups.map((g) => [g.id, g.name]),
      ["archived", "已归档"],
    ]) +
    '<div class="employee-grid">' +
    (list.length
      ? list
          .map(
            (e) =>
              '<article class="employee-card"><div class="flow between"><div class="person"><span class="avatar lg">' +
              esc(e.name.slice(0, 2)) +
              '</span><div><button class="text-link employee-name" data-action="employee" data-id="' +
              e.id +
              '">' +
              esc(e.name) +
              '</button><p class="person-caption">' +
              esc(e.role) +
              "</p></div></div>" +
              tag(
                e.archived ? "已归档" : e.hookReady ? "记账已就绪" : "待接入",
                e.hookReady ? "green" : "amber",
              ) +
              '</div><div class="flow"><span class="group-chip">' +
              esc(e.group) +
              '</span><span class="mono">' +
              e.id +
              '</span></div><p class="help">' +
              (e.skills.length
                ? esc(e.skills.map((s) => s.split("/").at(-2) || s).join(" · "))
                : "尚未指定技能") +
              '</p><p class="employee-model-caption help">' + employeeModels.summary(e) + '</p><div class="spacer flow between">' +
              native(e.threadId) +
              (!e.archived ? btn(e.departmentId ? '转部门' : '分配部门', 'transfer-employee', e.id) : '') +
              btn(
                e.archived ? "详情" : "派发任务",
                "" + (e.archived ? "employee" : "new-task"),
                e.id,
              ) +
              "</div></article>",
          )
          .join("")
      : empty("没有符合条件的员工", "可以添加员工或调整筛选条件。")) +
    "</div>"
  );
}
function tasks() {
  const list = S.tasks
    .filter(
      (t) =>
        matchesTaskProgress(t, S, filters.select) &&
        matched(
          [taskProgress(t, S).title, t.businessId, t.category, name(t.ownerEmployeeId)].join(
            " ",
          ),
        ),
    )
    .reverse();
  return (
    heading(
      "团队任务",
      "负责人生成编号、名称、类别和状态；人类独立验收",
      btn("协作视图", "nav", "collaboration") + btn("新建任务", "new-task", "", true),
    ) +
    '<div class="flow section-gap" aria-label="验收统计">' +
    btn("待验收 " + S.tasks.filter(t => taskAcceptance(t, S) === "awaiting_acceptance").length, "task-filter", "awaiting_acceptance") +
    btn("已完成 " + S.tasks.filter(t => taskAcceptance(t, S) === "accepted_complete").length, "task-filter", "accepted_complete") +
    '</div>' +
    filterbar("搜索任务、编号、类别或负责人", [
      ["all", "全部状态"],
      ["awaiting_acceptance", "待验收"],
      ["accepted_complete", "已完成（验收通过）"],
      ...[
        "unregistered",
        "queued",
        "in_progress",
        "waiting_input",
        "blocked",
        "collaboration_pending",
        "completed",
        "cancelled",
      ].map((s) => [s, labels[s]]),
    ]) +
    panel("业务进度", taskTable(list))
  );
}
function messages() {
  const list=S.requests.filter(r=>(!filters.select||filters.select==='all'||r.employeeId===filters.select)&&matched([r.id,name(r.employeeId),name(r.fromEmployeeId)].join(' '))).sort((a,b)=>b.sequence-a.sequence);
  return heading('协作消息','按请求追踪发送、接收、领取、工作报告与结果处理',btn('联系员工','new-task','',true))+
    filterbar('搜索员工或请求编号',[['all','全部员工'],...S.employees.map(e=>[e.id,e.name])])+
    panel('业务输入与交接',list.length?'<div class="record-list">'+list.map(r=>{
      const p=deliveryProgress(r,S);
      return '<article><div class="flow between"><strong>'+esc(r.fromEmployeeId?name(r.fromEmployeeId):'你')+' → '+esc(name(r.employeeId))+'</strong>'+tag(({work:'协作工作',result:'结果回传',note:'通知',acceptance_notice:'验收通知',acceptance_rework:'验收整改'})[r.kind]||(r.mode==='steer'?'steer · 补充':'FIFO · 独立输入'))+'</div><p>'+tag(p.label,['failed','uncertain','blocked'].includes(p.state)?'amber':'blue')+'</p><p class="help">'+esc(p.reason)+'</p><div class="source">'+time(r.createdAt)+' · '+esc(r.id)+'</div>'+
        ((r.source||'').startsWith('human')?'<details class="spacer"><summary>查看你提交的业务输入</summary><div class="pre">'+esc(r.instruction)+'</div></details>':'')+
        '<div class="spacer flow">'+btn('投递与回执','delivery',r.id)+btn('关联任务','task',r.taskRef)+(p.targetThreadId?native(p.targetThreadId):'')+'</div></article>';
    }).join('')+'</div>':empty('还没有协作记录','派发工作，或由员工直接交接后，将显示可追溯的回执。'))+
    panel('原生工具活动','<div class="record-list">'+S.events.filter(e=>e.kind==='native_tool').slice(-30).reverse().map(e=>'<article><strong>'+esc(threadName(e.threadId))+' · '+esc(e.tool)+'</strong> '+tag(e.state==='accepted'?'原生调用已接受':e.state)+'<div class="source">'+time(e.at)+(e.targetThreadId?' → '+esc(threadName(e.targetThreadId)):'')+'</div></article>').join('')+'</div>');
}
function recordCards(list, compact = false) {
  return list.length
    ? '<div class="record-list">' +
        list
          .map(
            (r) =>
              '<article><div class="flow between"><strong>' +
              esc(r.title) +
              "</strong>" +
              tag(
                r.authority,
                r.authority === "owner_report" ? "blue" : "purple",
              ) +
              "</div><p>" +
              esc(r.summary || "本轮无额外摘要") +
              '</p><div class="source">' +
              esc(name(r.employeeId)) +
              " · " +
              time(r.recordedAt) +
              " · " +
              esc(r.businessId) +
              "</div>" +
              (!compact
                ? '<div class="spacer flow">' +
                  btn("来源与证据", "record", r.id) +
                  btn("关联任务", "task", r.taskRef) +
                  native(r.threadId) +
                  "</div>"
                : "") +
              "</article>",
          )
          .join("") +
        "</div>"
    : empty(
        "工作记录将在这里出现",
        "员工结束原生轮次后，共享 hook 自动记录摘要与来源。",
      );
}
function records() {
  const list = S.records
    .filter(
      (r) =>
        (!filters.select ||
          filters.select === "all" ||
          r.authority === filters.select) &&
        matched(
          [r.title, r.summary, r.businessId, name(r.employeeId)].join(" "),
        ),
    )
    .reverse();
  return (
    heading(
      "共享记录",
      "可追溯的团队工作记忆 · 保留员工、任务、原生轮次和产物摘要",
      btn("共享目录", "directory") + btn("导出 metadata", "export"),
    ) +
    '<div class="record-summary"><div><strong>员工记录自己的工作，人类保留决定权</strong><p>自动摘要与原生事件互相核对，完整对话始终留在 Codex。</p></div>' +
    tag(S.records.length + " 条真实记录", "green") +
    "</div>" +
    filterbar("搜索业务编号、摘要或员工", [
      ["all", "全部记录"],
      ["owner_report", "负责人报告"],
      ["contributor_report", "协作者报告"],
      ["acceptance_receipt", "验收通知回执"],
    ]) +
    panel("工作记录", recordCards(list)) +
    panel(
      "人类决定与验收审计",
      '<div class="record-list">' +
        S.audit
          .filter(
            (a) =>
              a.action.startsWith("decision.") ||
              /^task\.(accepted|rejected)$/.test(a.action),
          )
          .slice(-30)
          .reverse()
          .map(
            (a) =>
              "<article><strong>" +
              esc(labels[a.action] || a.action) +
              '</strong><div class="source">人类 · ' +
              time(a.at) +
              " · " +
              esc(a.subject) +
              "</div></article>",
          )
          .join("") +
        "</div>",
    )
  );
}
function decisions() {
  const list = S.decisions
    .filter((d) =>
      filters.select === "resolved"
        ? ["resolved", "closed"].includes(d.state)
        : !["resolved", "closed"].includes(d.state),
    )
    .reverse();
  return (
    heading(
      "待你决定",
      "产品判断由你作出；回复会作为补充输入交给提出问题的员工",
    ) +
    filterbar("搜索决定或问题", [
      ["all", "未解决"],
      ["resolved", "已决定"],
    ]) +
    '<div class="stack">' +
    (list
      .filter((d) => matched(d.title + " " + d.question))
      .map((d) =>
        panel(
          d.title,
          '<div class="card-body"><p class="pre">' +
            esc(d.question) +
            '</p><div class="spacer flow">' +
            tag(d.state, "amber") +
            '<span class="muted smalltext">' +
            (d.source === "native_question" ? "提问员工：" : "负责人：") +
            esc(
              name(
                d.source === "native_question"
                  ? d.fromEmployeeId
                  : d.ownerEmployeeId,
              ),
            ) +
            "</span></div>" +
            (d.answer
              ? '<p class="spacer pre">你的回复：' + esc(d.answer) + "</p>"
              : "") +
            '<div class="spacer flow">' +
            btn(
              d.state === "resolved" ? "查看决定" : "查看并决定",
              "decision",
              d.id,
            ) +
            (d.taskRef ? btn("关联任务", "task", d.taskRef) : "") +
            (d.sourceThreadId ? native(d.sourceThreadId) : "") +
            "</div></div>",
        ),
      )
      .join("") ||
      empty(
        "没有待处理事项",
        "员工需要明确产品规则时，会带着问题和选项来找你。",
      )) +
    "</div>"
  );
}
function rules() {
  const h = S.health,
    connection = h.connection;
  return (
    heading(
      "团队设置",
      "管理共享约定、技能、原生接入和自动工作记录",
      soon("权限策略编辑器"),
    ) +
    '<div class="cols"><div>' +
    panel(
      "团队约定",
      '<form class="card-body" data-form="settings">' +
        field(
          "团队名称",
          '<input name="teamName" required maxlength="80" value="' +
            esc(S.settings.teamName) +
            '">',
        ) +
        '<p class="help">共享工作约定在团队资料中按版本维护，员工按需读取生效版本。</p><div class="spacer flow">' +
        btn("查看团队约定", "resource", "DOC-team-rules") + btn("管理资料", "nav", "resources") + '</div>' +
        '<div class="error" role="alert"></div>' +
        btn("保存团队名称", "submit", "", true) +
        "</form>",
    ) +
    panel(
      "Codex 按需接入",
      '<div class="card-body stack"><div class="flow">' +
        tag(connection?.online ? "同实例连接已核验" : "等待连接", connection?.online ? "green" : "amber") +
        '</div><p class="help">提交后立即进入现有 Codex。FIFO 使用原生队列；steer 追加到指定业务的当前轮次。</p>' +
        (connection?.error ? '<p class="error">' + esc(connection.error) + '</p>' : '') +
        connectionDetails(h, {esc,time,name}) +
        '<div class="flow">' + btn("重新检查连接", "reconnect") +
        (!connection?.online ? btn("以共享接入启动 Codex", "launch-codex") : '') +
        btn(S.settings.enabled ? "暂停派发与记账" : "恢复派发与记账", "toggle") +
        '</div><div class="source">连接时间：' + time(connection?.connectedAt) +
        '<br>Codex：' + esc(connection?.version || "尚未识别") +
        '<br>共享实例：' + esc(connection?.pid || "尚未核验") +
        '</div><details><summary>连接与恢复说明</summary><p class="help spacer">首次接入时，先正常退出 Codex，再点击“以共享接入启动 Codex”。此模式仅影响本次桌面启动；下次直接打开 Codex 会恢复其默认连接。关闭 TeamDesk 不会停止员工工作。恢复连接后先核对已有回执，结果不确定的输入不会自动重发。</p><p class="help">要求 Codex CLI 0.155.0 及以上（含该基线的预发布版本）。更新版本仍核验共享连接；实际不兼容时显示原因。定时模型检查已停用。</p></details></div>',
    ) +
    panel("投递恢复", operationCards()) +
    "</div><div>" +
    panel(
      "共享自动记账",
      '<div class="card-body stack">' +
        tag(h.hookTrust.recorded ? "原生信任已核验" : "需要审查", h.hookTrust.recorded ? "green" : "amber") +
        '<p class="help">在这里审查并信任 TeamDesk 的共享 hook。同一插件定义的信任可供新员工复用，无需逐人配置。</p>' +
        btn("审查共享 hook", "review-hook") +
        '<p class="help">信任是配置许可。每位员工完成真实轮次并产生当前版本的记账回执后，才会显示“记账已就绪”。定义变化需要重新审查。</p></div>',
    ) +
    panel(
      "技能与工具",
      '<div class="card-body stack"><p class="help">复用本机已安装技能。员工工作说明不会更改 Codex 工具权限；实际权限仍由原生任务管理。</p>' +
        btn("查看可用技能", "skills") +
        soon("岗位模板库") +
        soon("用量与成本分析") +
        "</div>",
    ) +
    panel(
      "本机存储",
      '<div class="card-body"><p class="mono">' +
        esc(h.dataDirectory) +
        '</p><p class="help spacer">SQLite 持久化，原始对话不复制入库。关闭页面后数据保留。</p><div class="spacer flow">' +
        btn("共享目录", "directory") +
        btn("导出 metadata", "export") +
        '</div><p class="source">Codex 只读适配：' +
        esc(h.adapter || "不可用") +
        "<br>TeamDesk " +
        esc(S.version) +
        "</p></div>",
    ) +
    "</div></div>"
  );
}
function operationCards() {
  const ops = S.operations
    .filter((o) =>
      ["pending", "leased", "sending", "failed", "uncertain", "paused"].includes(o.state),
    )
    .reverse();
  return ops.length
    ? '<div class="record-list">' +
        ops
          .map(
            (o) =>
              '<article><div class="flow between"><strong>' +
              esc(name(o.employeeId)) +
              " · " +
              esc(
                {
                  create_employee: "创建员工原生任务",
                  onboard: "入职探测",
                  deliver: "投递输入",
                  answer_question: "回复原生问题",
                }[o.kind] || o.kind,
              ) +
              "</strong>" +
              tag(o.state, "amber") +
              "</div>" +
              (o.error ? '<p class="error">' + esc(o.error) + "</p>" : "") +
              '<div class="source">' +
              time(o.createdAt) +
              " · 尝试 " +
              o.attempts +
              " 次</div>" +
              (o.state === "uncertain" && o.kind === "create_employee"
                ? '<p class="help">请到员工详情绑定已创建的原生任务，避免重复创建。</p>'
                : "") +
              (["failed", "uncertain", "paused"].includes(o.state)
                ? '<div class="spacer flow">' +
                  (o.state === "uncertain" ? btn("核对原生回执", "reconcile", o.id)
                    : btn("恢复派发", "retry", o.id) + btn("取消待派发操作", "cancel-op", o.id)) +
                  '</div>' : '') +
              "</article>",
          )
          .join("") +
        "</div>"
    : empty("没有待恢复的投递", "有失败或需要核对的原生操作时，会在这里显示。");
}
function show(title, html) {
  lastFocus = document.activeElement;
  dialog.innerHTML =
    '<header class="modal-header"><div><span class="eyebrow">TEAMDESK</span><h2 id="dialog-title">' +
    esc(title) +
    '</h2></div><button class="icon-button" data-action="close" aria-label="关闭">×</button></header><div class="modal-body">' +
    html +
    "</div>";
  setupEmployeePickers();
  writer.mount();
  if (!dialog.open) dialog.showModal();
  dialog.querySelector("input,textarea,select,button")?.focus();
}
function close() {
  dialog.close();
  refresh();
  lastFocus?.focus();
}
async function loadCatalog() {
  catalogCache = await api("/api/catalog");
  return catalogCache.threads.filter((t) => !t.archived);
}
function nativeSelect(list, selected = "", label = "关联 Codex 会话") {
  const chosen = list.find(t => t.id === selected);
  return `<div class="field native-picker">
    <label for="native-combobox">${esc(label)}</label>
    <div class="native-control">
      <input id="native-combobox" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="native-options" aria-describedby="native-hint" autocomplete="off" required placeholder="搜索或选择 Codex 会话…" value="${esc(chosen?.title)}">
      <input type="hidden" name="threadId" value="${esc(chosen?.id)}">
      <button type="button" class="native-toggle" aria-label="展开会话列表" tabindex="-1"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7.5 5 5 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </div>
    <div class="native-menu" hidden>
      <div id="native-options" class="native-options" role="listbox" aria-label="可关联的 Codex 会话">
        ${list.map((t, i) => `<div id="native-option-${i}" class="native-option" role="option" aria-selected="${t.id === chosen?.id}" data-thread="${esc(t.id)}" data-title="${esc(t.title)}" data-directory="${esc(t.cwd)}" data-search="${esc([t.title, t.id, t.cwd].join(' ').toLowerCase())}">
          <span><strong>${esc(t.title)}</strong><small>${esc(t.cwd?.split('/').filter(Boolean).at(-1) || '无工作目录')} · ${esc(t.id.slice(0, 8))}</small></span><span class="native-check" aria-hidden="true">✓</span>
        </div>`).join('')}
      </div>
      <p class="native-empty" hidden>没有匹配的会话，试试其他名称或工作目录。</p>
    </div>
    <small id="native-hint">${chosen ? esc('工作目录：' + chosen.cwd) : '输入名称、编号或工作目录查找，再选择要关联的会话。'}</small>
  </div>`;
}
function skillPicker(skills, selected = []) {
  skills = [...skills, ...selected.filter(path => !skills.some(s => s.path === path)).map(path => ({
    path, name: path.split('/').at(-2) || path, source: '已绑定 · 当前未列入目录',
  }))];
  return `<fieldset class="skill-picker">
    <legend>技能 <span class="optional">可选，可多选</span></legend>
    <p class="help">选择员工工作时使用的技能，可随时调整。</p>
    <div class="skill-toolbar">
      <div class="skill-search"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><input type="search" id="skill-search" aria-label="搜索技能" placeholder="搜索技能名称或来源…"></div>
      <span class="skill-count" role="status" aria-live="polite"></span>
    </div>
    <div class="skill-selected" aria-label="已选技能" hidden></div>
    <div class="skill-options">
      ${skills.map(s => `<label class="skill-option" data-search="${esc([s.name, s.source].join(' ').toLowerCase())}" title="${esc(s.path)}">
        <input type="checkbox" name="skills" value="${esc(s.path)}" data-name="${esc(s.name)}" ${selected.includes(s.path) ? 'checked' : ''}>
        <span><strong>${esc(s.name)}</strong><small>${esc(s.source === 'local' ? '本地技能' : s.source)}</small></span>
      </label>`).join('')}
      <p class="skill-empty" hidden>没有匹配的技能，试试其他关键词。</p>
    </div>
    <small class="help">来自 Codex 已安装的技能；搜索不会清除已选项。</small>
  </fieldset>`;
}
function setupEmployeePickers() {
  const picker = dialog.querySelector('.native-picker');
  if (picker) {
    const input = picker.querySelector('[role="combobox"]'), value = picker.querySelector('[name="threadId"]'),
      menu = picker.querySelector('.native-menu'), toggle = picker.querySelector('.native-toggle'),
      options = [...picker.querySelectorAll('[role="option"]')];
    let active = -1;
    const visible = () => options.filter(o => !o.hidden);
    const highlight = (index) => {
      const rows = visible();
      active = index >= 0 && index < rows.length ? index : -1;
      options.forEach(o => o.classList.toggle('active', o === rows[active]));
      if (rows[active]) {
        input.setAttribute('aria-activedescendant', rows[active].id);
        rows[active].scrollIntoView({ block: 'nearest' });
      } else input.removeAttribute('aria-activedescendant');
    };
    const setOpen = (open, filter = false) => {
      const opening = menu.hidden && open;
      menu.hidden = !open;
      input.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? '收起会话列表' : '展开会话列表');
      picker.classList.toggle('is-open', open);
      if (open) {
        const query = filter ? input.value.trim().toLowerCase() : '';
        options.forEach(o => o.hidden = !o.dataset.search.includes(query));
        picker.querySelector('.native-empty').hidden = visible().length > 0;
        highlight(-1);
      } else highlight(-1);
      if (opening) picker.scrollIntoView({ block: 'nearest' });
    };
    const choose = (option) => {
      value.value = option.dataset.thread;
      input.value = option.dataset.title;
      input.setCustomValidity('');
      picker.querySelector('#native-hint').textContent = '工作目录：' + option.dataset.directory;
      options.forEach(o => o.setAttribute('aria-selected', String(o === option)));
      setOpen(false);
    };
    input.addEventListener('focus', () => setOpen(true, !value.value));
    input.addEventListener('click', () => { if (menu.hidden) setOpen(true, !value.value); });
    input.addEventListener('input', () => {
      value.value = '';
      input.setCustomValidity('请从搜索结果中选择一个 Codex 会话。');
      picker.querySelector('#native-hint').textContent = '输入名称、编号或工作目录查找，再选择要关联的会话。';
      options.forEach(o => o.setAttribute('aria-selected', 'false'));
      setOpen(true, true);
    });
    input.addEventListener('invalid', () => setOpen(true, true));
    input.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      const wasOpen = !menu.hidden;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!wasOpen) setOpen(true);
        const rows = visible();
        highlight(event.key === 'ArrowDown' ? (active + 1) % rows.length : (active <= 0 ? rows.length - 1 : active - 1));
      } else if (event.key === 'Enter' && (wasOpen || !value.value)) {
        event.preventDefault();
        if (wasOpen && visible()[active]) choose(visible()[active]);
      } else if (event.key === 'Escape' && wasOpen) {
        event.preventDefault(); event.stopPropagation(); setOpen(false);
      }
    });
    picker.addEventListener('pointerdown', event => {
      if (event.target.closest('[role="option"],.native-toggle')) event.preventDefault();
    });
    picker.addEventListener('click', event => {
      const option = event.target.closest('[role="option"]');
      if (option) choose(option);
      else if (event.target.closest('.native-toggle')) {
        const open = menu.hidden;
        input.focus();
        setOpen(open);
      }
    });
    picker.addEventListener('focusout', event => { if (!picker.contains(event.relatedTarget)) setOpen(false); });
    const mode = picker.closest('form').elements.bindingMode;
    mode?.addEventListener('change', () => {
      const existing = mode.value === 'existing';
      input.required = existing;
      input.disabled = value.disabled = !existing;
      setOpen(false);
    });
  }
  const skillBox = dialog.querySelector('.skill-picker');
  if (skillBox) {
    const choices = [...skillBox.querySelectorAll('input[name="skills"]')], chips = skillBox.querySelector('.skill-selected');
    const update = () => {
      const checked = choices.filter(c => c.checked);
      skillBox.querySelector('.skill-count').textContent = `已选 ${checked.length} 项`;
      chips.hidden = checked.length === 0;
      chips.innerHTML = checked.map(c => `<button type="button" class="skill-chip" data-skill="${esc(c.value)}" aria-label="取消选择 ${esc(c.dataset.name)}">${esc(c.dataset.name)}<span aria-hidden="true">×</span></button>`).join('');
    };
    skillBox.addEventListener('change', update);
    chips.addEventListener('click', event => {
      const button = event.target.closest('[data-skill]');
      if (!button) return;
      const chosen = choices.find(c => c.value === button.dataset.skill);
      chosen.checked = false;
      update();
      skillBox.querySelector('#skill-search').focus();
    });
    skillBox.querySelector('#skill-search').addEventListener('input', event => {
      const query = event.target.value.trim().toLowerCase(), rows = [...skillBox.querySelectorAll('.skill-option')];
      rows.forEach(row => row.hidden = !row.dataset.search.includes(query));
      skillBox.querySelector('.skill-empty').hidden = rows.some(row => !row.hidden);
    });
    update();
  }
}
async function employeeForm(id) {
  const e = S.employees.find((e) => e.id === id),
    [list, skillResult] = await Promise.all([
      loadCatalog(),
      api("/api/skills"),
    ]);
  skillCache = skillResult.skills;
  const available = list.filter(
    (t) =>
      !S.employees.some(
        (x) => !x.archived && x.id !== id && x.threadId === t.id,
      ),
  );
  show(
    e ? "编辑员工" : "添加员工",
    '<form data-form="employee" data-id="' +
      (id || "") +
      '" data-department-revision="' + (e?.departmentRevision || 0) + '"><div class="grid2">' +
      field(
        "员工姓名",
        '<input name="name" required maxlength="60" value="' +
          esc(e?.name) +
          '" placeholder="例如 Boyi-01">',
      ) +
      field(
        "岗位",
        '<input name="role" required maxlength="80" value="' +
          esc(e?.role) +
          '" placeholder="例如 提示词工程师">',
      ) +
      "</div>" +
      field(
        "所属部门",
        '<select name="departmentId">' + opts([['', '未分配部门'], ...S.departments.filter(d => !d.archived).map(d => [d.id, d.name])], e?.departmentId || '') + '</select>',
        "每位员工最多属于一个部门，也可暂时未分配；同部门员工可按需查询彼此的技能描述。",
      ) +
      field(
        "工作说明（选填）",
        '<textarea name="instructions" rows="3" maxlength="8000" placeholder="例如：负责提示词设计；交付时附使用示例；需求有分歧时向我确认。">' +
          esc(e?.instructions) +
          "</textarea>",
        "补充这位员工的职责、工作方式和交付要求。员工接收 TeamDesk 任务时会读取；已有技能覆盖的流程无需重复填写。",
      ) +
      skillPicker(skillCache, e?.skills) +
      '<p class="help spacer">模型与运行偏好：' + (e ? employeeModels.summary(e) : '新员工继承所绑定 Codex 会话的配置') + '。保存后可在员工详情中调整。</p>' +
      (!e
        ? field(
            "会话方式",
            '<select name="bindingMode"><option value="existing">绑定已有 Codex 任务</option><option value="new">新建原生 Codex 任务</option></select>',
          ) +
          '<div id="existing-binding">' +
          nativeSelect(available) +
          '</div><p class="help">新任务在现有 Codex 中创建。绑定后自动检查记账；同一共享 hook 的信任可复用。</p>' + tag(S.health.hookTrust.recorded ? '共享 hook 已信任 · 入职时自动复用' : '添加后需要审查共享 hook', S.health.hookTrust.recorded ? 'green' : 'amber')
        : "") +
      '<div class="error" role="alert"></div><div class="modal-footer">' +
      btn(e ? "保存员工" : "添加到团队", "submit", "", true) +
      "</div></form>",
  );
}
function employeeDetail(id) {
  const e = S.employees.find((e) => e.id === id);
  if (!e) return;
  const history = S.bindings.filter((b) => b.employeeId === id).reverse();
  show(
    e.name,
    '<div class="flow">' +
      tag(e.role, "blue") +
      tag(e.group) +
      tag(
        e.archived ? "已归档" : e.hookReady ? "记账已就绪" : "待接入",
        e.hookReady ? "green" : "amber",
      ) +
      '</div><p class="mono spacer">' +
      e.id +
      '</p><section class="detail-section"><h3>关联会话</h3><p class="spacer">' +
      esc(e.threadTitle || "等待原生接入创建") +
      '</p><p class="mono">' +
      esc(e.threadId) +
      '</p><div class="spacer flow">' +
      native(e.threadId) +
      (!e.archived
        ? btn("绑定 / 换绑", "bind", id) + btn("重新探测", "probe", id)
        : "") +
      '</div><p class="help spacer">换绑保留员工身份、任务与历史记录，旧会话后续 hook 不再写入。</p></section><section class="detail-section"><h3>自动记账</h3><p class="spacer">' +
      tag(e.runtime) +
      " " +
      tag(
        e.hookReady ? "原生触发已验证" : "等待原生触发",
        e.hookReady ? "green" : "amber",
      ) +
      '</p><p class="source">最近 hook：' +
      time(e.lastHook?.at) +
      " · 绑定版本 " +
      e.bindingVersion +
      "</p>" +
      (e.lastHookError
        ? '<p class="error">' + esc(e.lastHookError.message) + "</p>"
        : "") +
      '</section><section class="detail-section"><h3>模型与运行偏好</h3><p class="spacer">' + employeeModels.summary(e) + '</p><p class="help spacer">与当前关联的 Codex 会话同步，作为后续轮次默认值。</p><div class="spacer">' + (!e.archived ? btn('模型与运行偏好', 'employee-models', id) : '') + '</div></section><section class="detail-section"><h3>技能与工作说明</h3><p class="help pre spacer">' +
      esc(e.skills.join("\n") || "未指定技能") +
      '</p><p class="pre spacer role-instructions">' +
      esc(e.instructions || "未填写额外工作说明") +
      "</p></section><details><summary>查看绑定历史（" +
      history.length +
      '）</summary><div class="timeline spacer">' +
      history
        .map(
          (b) =>
            "<article><strong>版本 " +
            b.version +
            " · " +
            (b.active ? "当前" : "历史") +
            '</strong><p class="mono">' +
            b.threadId +
            '</p><p class="source">' +
            time(b.boundAt) +
            "</p>" +
            native(b.threadId) +
            "</article>",
        )
        .join("") +
      '</div></details><div class="modal-footer flow">' +
      (!e.archived
        ? btn("派发任务", "new-task", id, true) +
          btn("编辑员工", "edit-employee", id)
          + btn(e.departmentId ? '转部门' : '分配部门', 'transfer-employee', id)
          + (e.departmentId ? btn('移出部门', 'remove-employee-department', id) : '')
        : "") +
      btn(e.archived ? "恢复员工" : "归档员工", "archive", id) +
      "</div>",
  );
}
function participantChoices(ownerId, selected = []) {
  const choices = S.employees.filter((e) => !e.archived && e.id !== ownerId);
  return (
    '<fieldset class="participant-picker"><legend>指定协作员工（可选，可多选）</legend><p class="help">选中的员工必须实际参与本任务。负责人按目标与技能安排分工；协作者也可直接联系其他员工，结果回到交接发起方。</p><div class="participant-list">' +
    (choices.length
      ? choices
          .map(
            (e) =>
              '<article class="participant-card"><label class="participant-option"><input type="checkbox" name="participants" value="' +
              esc(e.id) +
              '"' +
              (selected.includes(e.id) ? " checked" : "") +
              "><span><strong>" +
              esc(e.name) +
              "</strong><small>" +
              esc(e.role + " · " + e.group) +
              "</small><small>" + esc((e.capabilities || []).map(s => s.name).join(' · ') || '未指定技能') +
              "</small></span></label>" + capabilityDetails(e.capabilities || []) + '</article>',
          )
          .join("")
      : '<p class="help">当前没有其他在职员工，可暂不指定协作者。</p>') +
    "</div></fieldset>"
  );
}
function capabilityDetails(skills) {
  if (!skills.length) return '';
  return '<details class="capability-details"><summary>查看技能能力说明</summary>' + skills.map(s =>
    '<div class="capability-description"><strong>' + esc(s.name) + '</strong><p class="pre">' +
    esc(s.description || (s.status === 'unavailable' ? '技能文件暂不可读，能力说明未知。' : '此技能未提供 description，需读取技能确认能力。')) +
    '</p><p class="source">' + esc(s.path) + '</p></div>').join('') + '</details>';
}
function collaborationSection(task) {
  const progress = collaborationProgress(task, S);
  const states = { awaiting_delivery: '待投递 / 接收', working: '工作中', blocked: '受阻',
    awaiting_result_delivery: '结果待接收', awaiting_handling: '发起方待处理',
    awaiting_work_record: '处理已记录 · 待工作报告', changes_requested: '需要整改', handled: '发起方已处理' };
  if (!progress.enforced && !progress.edges.length) return '';
  return '<section class="detail-section"><h3>协作进度</h3><p class="help spacer">每次交接的结果由发起方处理；负责人负责最终整合。</p>' +
    (progress.required.length ? '<div class="flow spacer">' + progress.required.map(r => tag(name(r.employeeId) + ' · ' +
      (r.complete ? '指定协作已完成' : r.assigned ? '指定协作进行中' : '待安排指定协作'), r.complete ? 'green' : 'amber')).join('') + '</div>' : '') +
    '<div class="collaboration-edges">' + progress.edges.map(edge =>
      '<article class="collaboration-edge"><div class="flow"><strong>' + esc(name(edge.fromEmployeeId)) + ' → ' + esc(name(edge.employeeId)) + '</strong>' +
      tag(states[edge.state], edge.state === 'handled' ? 'green' : 'amber') + '</div><p class="spacer">' + esc(edge.purpose) + '</p>' +
      (edge.handlingSummary ? '<p class="help">处理结果：' + esc(edge.handlingSummary) + '</p>' : '') +
      '<details><summary>交接关系与证据</summary><p class="source mono">请求 ' + esc(edge.id) + '<br>来源请求 ' + esc(edge.parentRequestId) +
      '<br>对应结果 ' + esc(edge.resultRequestId || '尚未收到') + '</p><div class="flow spacer">' +
      (edge.reportId ? btn('查看工作报告', 'record', edge.reportId) : '') +
      (edge.handlingRecordId ? btn('查看处理记录', 'record', edge.handlingRecordId) : '') + '</div></details></article>').join('') + '</div>' +
    (!progress.edges.length ? '<p class="help spacer">尚未记录实际交接。</p>' : '') +
    (task.requiredCollaboratorsSnapshot?.length ? '<details class="spacer"><summary>派发时的技能说明快照</summary>' + task.requiredCollaboratorsSnapshot.map(e =>
      '<h4 class="spacer">' + esc(e.name) + '</h4>' + capabilityDetails(e.skills)).join('') + '</details>' : '') + '</section>';
}
function inputForm(employeeId = "", taskRef = "") {
  const active = S.employees.filter((e) => !e.archived);
  if (!active.length) {
    toast("请先添加员工");
    return;
  }
  const task = S.tasks.find((t) => t.id === taskRef),
    selected = task?.ownerEmployeeId || employeeId || active[0].id;
  show(
    task ? "补充当前任务" : "联系员工 / 新建任务",
    '<form data-form="input">' +
      field(
        "负责人",
        '<select name="employeeId">' +
          opts(
            active.map((e) => [e.id, e.name + " · " + e.role]),
            selected,
          ) +
          "</select>",
      ) +
      field(
        "输入方式",
        '<select name="mode">' +
          opts(
            [
              ["fifo", "FIFO · 新的独立业务"],
              ["steer", "steer · 补充已有业务"],
            ],
            task ? "steer" : "fifo",
          ) +
          "</select>",
      ) +
      '<div id="steer-target">' +
      taskSelect(selected, taskRef) +
      "</div>" +
      field(
        "要完成什么 / 补充内容",
        '<textarea name="instruction" required rows="5" maxlength="12000" placeholder="描述目标、上下文和你希望员工完成的事情…"></textarea>',
      ) +
      '<div id="fifo-fields">' +
      field(
        "完成标准",
        '<textarea name="acceptanceCriteria" rows="2" maxlength="4000" placeholder="怎样判断工作已经完成"></textarea>',
      ) +
      '<div id="participant-choices">' +
      participantChoices(selected) +
      "</div>" +
      '<details class="model-task-note"><summary>运行设置 · 使用员工默认配置</summary><p class="help spacer">负责人和协作者各自使用其 Codex 会话的默认配置。任务级临时覆盖待验证后开放。</p>' + btn('仅为此任务调整模型与运行偏好', 'model-task-soon') + '</details>' +
      '</div><p class="help">不论员工是否正在工作都可提交。任务名称、编号和类别由负责人建立；steer 必须指向同一负责人的业务。</p><div class="error" role="alert"></div><div class="modal-footer">' +
      btn("保存并交给 Codex", "submit", "", true) +
      "</div></form>",
  );
  toggleMode();
}
function taskSelect(id, selected) {
  return field(
    "关联业务任务",
    '<select name="taskRef">' +
      opts(
        [
          ["", "请选择任务…"],
          ...S.tasks
            .filter((t) => t.ownerEmployeeId === id)
            .map((t) => [
              t.id,
              t.businessId
                ? t.businessId + " · " + t.title
                : "待建档 · " +
                  t.goal.replace(/\s+/g, " ").slice(0, 60) +
                  " · " +
                  t.id.slice(0, 13),
            ]),
        ],
        selected,
      ) +
      "</select>",
  );
}
function toggleMode() {
  const f = dialog.querySelector('form[data-form="input"]');
  if (f) {
    const steer = f.elements.mode.value === "steer";
    $("#steer-target").hidden = !steer;
    $("#fifo-fields").hidden = steer;
    f.elements.taskRef.required = steer;
    writer.formChanged();
  }
}
function acceptanceDelivery(t) {
  if (!t.acceptance) return '';
  const r = S.requests.find(r => r.id === t.acceptance.notificationRequestId);
  if (!r) return '<p class="help spacer">历史验收记录：当时未发送负责人通知。</p>';
  const receipt = S.records.find(x => x.requestId === r.id && x.authority === 'acceptance_receipt');
  const op = S.operations.find(x => x.requestId === r.id);
  return '<section class="detail-section"><h3>验收反馈给负责人</h3><div class="flow spacer">' +
    tag(receipt ? '负责人已确认' : r.state, receipt ? 'green' : 'blue') +
    (op?.state === 'failed' || op?.state === 'uncertain' ? tag(op.state, 'amber') : '') +
    '</div><p class="source">原生回执：' + time(r.nativeAcceptedAt) + ' · 原生接收：' + time(r.receivedAt) +
    (receipt ? ' · 确认：' + time(receipt.recordedAt) : '') + '</p>' +
    (receipt ? '<p class="pre spacer">' + esc(receipt.summary) + '</p>' : '') +
    '<div class="flow spacer">' + btn('查看投递记录', 'nav', 'messages') + '</div></section>';
}
function taskDetail(id) {
  const t = S.tasks.find((t) => t.id === id);
  if (!t) return;
  const rec = S.records.filter((r) => r.taskRef === id).reverse();
  const view = taskProgress(t, S);
  show(
    view.title,
    '<div class="flow">' +
      status(t) +
      acceptance(t) +
      btn('查看协作', 'collaboration', t.id) +
      '</div>' +
      (view.detail ? '<p class="help spacer">' + esc(view.detail) + '</p>' : '') +
      '<p class="mono spacer">' +
      esc(t.businessId || "业务编号等待负责人生成") +
      '</p><p class="source">内部引用 ' +
      t.id +
      " · 版本 " +
      t.revision +
      '</p><div class="grid2 spacer"><p>负责人：' +
      esc(name(t.ownerEmployeeId)) +
      "</p><p>类别：" +
      esc(t.category || "待填写") +
      " · " +
      esc(taskProgress(t, S).stage) +
      '</p></div><section class="detail-section"><h3>业务目标</h3><p class="pre spacer">' +
      esc(t.goal) +
      '</p><p class="help spacer">完成标准：' +
      esc(t.acceptanceCriteria || "未单独指定") +
      '</p><p class="help">参与员工：' +
      esc(t.participants.map(name).join("、") || "无指定协作者") +
      '</p></section><section class="detail-section"><h3>最新进展</h3><p class="pre spacer">' +
      esc(t.summary || view.detail || "尚未收到负责人记录") +
      '</p><p class="help spacer">下一步：' +
      esc(t.nextAction || "—") +
      "</p></section>" +
      collaborationSection(t) +
      recordCards(rec) +
      (t.acceptance
        ? '<p class="source spacer">上次人类验收：' +
          esc(labels[t.acceptance.verdict]) +
          " · 证据版本 " +
          t.acceptance.revision +
          "<br>" +
          esc(t.acceptance.note) +
          "</p>"
        : "") +
      acceptanceDelivery(t) +
      '<div class="modal-footer flow">' +
      btn("补充此任务（steer）", "steer", id, true) +
      (t.status === "completed"
        ? (collaborationProgress(t, S).complete ? btn("验收通过", "accept", id) : '<button class="btn" disabled title="指定协作及交接结果完成后可验收">协作完成后验收</button>') + btn("退回整改", "reject", id)
        : "") +
      native(S.employees.find((e) => e.id === t.ownerEmployeeId)?.threadId) +
      "</div>",
  );
}
function recordDetail(id) {
  const r = S.records.find((r) => r.id === id);
  if (!r) return;
  const artifacts = r.artifacts
    .map(
      (a, i) =>
        '<li><a href="/api/artifact/' +
        encodeURIComponent(id) +
        "/" +
        i +
        '">' +
        esc(a.name) +
        ' ↓</a><p class="mono">' +
        esc(a.path) +
        '</p><p class="source">SHA-256 ' +
        a.sha256 +
        " · " +
        a.bytes +
        " bytes</p></li>",
    )
    .join("");
  show(
    "工作记录与证据",
    '<div class="flow">' +
      tag(r.authority, "blue") +
      tag(r.status) +
      '</div><h3 class="spacer">' +
      esc(r.title) +
      '</h3><p class="pre spacer">' +
      esc(r.summary) +
      '</p><p class="help spacer">下一步：' +
      esc(r.nextAction) +
      '</p><section class="detail-section"><h3>来源</h3><p class="source pre">员工：' +
      esc(name(r.employeeId)) +
      "\n业务：" +
      esc(r.businessId) +
      "\n原生任务：" +
      r.threadId +
      "\n轮次：" +
      esc(r.turnId) +
      "\n绑定版本：" +
      r.bindingVersion +
      "\n自动记账：" +
      time(r.recordedAt) +
      "\nHook 版本摘要：" +
      esc(r.hookDigest) +
      '</p><div class="spacer">' +
      native(r.threadId) +
      '</div></section>' +
      (r.handledResults?.length ? '<section class="detail-section"><h3>交接结果处理</h3>' + r.handledResults.map(h =>
        '<p class="spacer"><strong>' + esc({accepted:'采用结果',changes_requested:'要求整改',blocked:'记录阻塞'}[h.disposition]) +
        '</strong></p><p class="pre">' + esc(h.summary) + '</p><p class="source mono">对应结果 ' + esc(h.resultRequestId) + '</p>').join('') + '</section>' : '') +
      '<section class="detail-section"><h3>产物</h3>' +
      (artifacts
        ? '<ul class="stack spacer">' + artifacts + "</ul>"
        : '<p class="muted spacer">本条记录未关联文件产物</p>') +
      '</section><p class="help">本条是员工报告，不能代替人类验收。文件变更后必须重新报告才能下载新版本。</p>',
  );
}
function decisionDetail(id) {
  const d = S.decisions.find((d) => d.id === id);
  if (!d) return;
  if (d.source === "native_callback") return nativeDecisionDetail(d);
  const asker = S.employees.find((e) => e.id === d.fromEmployeeId);
  const nativeOnly =
    d.source === "native_question" &&
    ((!S.health.connection?.online && !d.taskRef) ||
      d.nativeTool !== "request_user_input_async" ||
      asker?.threadId !== d.sourceThreadId ||
      asker?.bindingVersion !== d.bindingVersion);
  if (["resolved", "closed", "answering"].includes(d.state)) {
    show(
      d.title,
      '<p class="pre">' +
        esc(d.question) +
        '</p><div class="spacer">' + tag(d.state) + '</div><p class="pre spacer">你的决定：' +
        esc(d.answer) +
        '</p><p class="source">' +
        time(d.decidedAt) +
        "</p>" +
        (d.taskRef ? btn("关联任务", "task", d.taskRef) : "") +
        (d.sourceThreadId ? native(d.sourceThreadId) : ""),
    );
    return;
  }
  if (nativeOnly) {
    show(
      d.title,
      '<p class="pre">' +
        esc(d.question) +
        '</p><p class="help spacer">此问题已同步。业务关联不唯一、员工绑定发生变化或原生提问正在阻塞等待时，请在原生任务中回答；可识别的原生回复会同步回来。</p>' +
        (d.sourceThreadId ? native(d.sourceThreadId) : ""),
    );
    return;
  }
  show(
    d.title,
    '<form data-form="decision" data-id="' +
      id +
      '" data-revision="' +
      d.revision +
      '"><p class="pre">' +
      esc(d.question) +
      "</p>" +
      (d.source === "native_question"
        ? '<p class="help">来自 ' +
          esc(name(d.fromEmployeeId)) +
          " 的原生提问。回复会作为补充输入交回提问员工。</p>" +
          (d.sourceThreadId ? native(d.sourceThreadId) : "")
        : "") +
      '<div class="spacer flow">' +
      d.options
        .map(
          (o) =>
            '<button class="btn" type="button" data-action="option" data-id="' +
            esc(o) +
            '">' +
            esc(o) +
            "</button>",
        )
        .join("") +
      "</div>" +
      field(
        "你的决定或需要补充的信息",
        '<textarea name="answer" required rows="4" maxlength="4000">' +
          esc(d.state === "needs_info" ? d.answer : "") +
          "</textarea>",
      ) +
      field(
        "操作",
        d.source === "native_question" ? '<input type="hidden" name="action" value="resolve"><span class="help">回答将带原生问题编号回到提问员工。</span>' : '<select name="action"><option value="resolve">作出产品决定</option><option value="needs_info">要求补充，保持未决</option></select>',
      ) +
      '<div class="error" role="alert"></div><div class="modal-footer">' +
      btn(
        d.source === "native_question"
          ? "记录并回复提问员工"
          : "记录并通知负责人",
        "submit",
        "",
        true,
      ) +
      "</div></form>",
  );
}
async function reviewHook() {
  const r = await api("/api/hooks/review");
  show("审查共享自动记账", '<p class="help">' + esc(r.scope) + '</p><dl class="source"><dt>版本</dt><dd>' + esc(r.version) + '</dd><dt>原生定义摘要</dt><dd class="mono">' + esc(r.currentHash) + '</dd><dt>本次审查文件摘要</dt><dd class="mono">' + esc(r.digest) + '</dd><dt>执行命令</dt><dd class="mono">' + esc(r.command) + '</dd></dl>' +
    r.files.map(f => '<details class="hook-source"><summary>' + esc(f.path) + '</summary><pre>' + esc(f.text) + '</pre></details>').join('') +
    (r.trustStatus === 'trusted' && r.enabled ? '<div class="status-banner">当前定义已信任，新员工可直接复用。实际执行结果会显示在员工详情。</div>' :
      r.isManaged ? '<p class="help">此配置由管理员管理。</p>' : '<form data-form="hook-trust" data-ticket="' + esc(r.ticket) + '"><label class="confirmation-check"><input type="checkbox" name="confirmed" required>我已审查以上配置和脚本，信任此定义在本机执行。</label><div class="error" role="alert"></div><div class="modal-footer">' + btn('信任此定义', 'submit', '', true) + '</div></form>'));
}
function nativeDecisionDetail(d) {
  let content = '<p class="pre">' + esc(d.question) + '</p><div class="spacer">' + tag(d.state) + '</div>' + (d.sourceThreadId ? native(d.sourceThreadId) : '');
  if (d.command) content += '<h3 class="spacer">待执行命令</h3><pre class="code-block">' + esc(d.command) + '</pre><p class="source">工作目录：' + esc(d.cwd) + '</p>';
  if (d.grantRoot) content += '<p class="source">请求写入范围：' + esc(d.grantRoot) + '</p>';
  if (d.state !== 'pending' || !d.callbackAvailable || !S.health.connection?.online) {
    show(d.title, content + '<p class="help spacer">' + (d.state === 'pending' ? '当前回调不可用，请在原生 Codex 中处理。' : d.state === 'closed' ? '原生请求已结束。未收到选择内容，因此不推断用户批准或拒绝。' : '已提交的选择：' + esc(d.answer || '等待回执')) + '</p>'); return;
  }
  content += '<form data-form="native-decision" data-id="' + esc(d.id) + '" data-revision="' + d.revision + '">';
  if (d.nativeMethod === 'item/tool/requestUserInput') content += d.callbackQuestions.map(q => field(q.question, '<textarea required name="question:' + esc(q.id) + '" maxlength="4000" rows="3"></textarea>', (q.options || []).map(o => o.label).join(' / '))).join('');
  else content += '<div class="native-choice-list">' + d.options.map(v => '<label><input type="radio" required name="decision" value="' + esc(v) + '">' + esc({accept:'仅允许本次操作',decline:'拒绝此操作，继续任务',cancel:'拒绝并停止本轮'}[v]) + '</label>').join('') + '</div>';
  show(d.title, content + '<div class="error" role="alert"></div><div class="modal-footer">' + btn('提交选择', 'submit', '', true) + '</div></form>');
}
async function action(type, id) {
  if (type === 'collaboration') { if(dialog.open)dialog.close(); await coView.open(id); return; }
  if (type === 'model-task-soon') return toast('Coming soon · 任务级临时覆盖尚未开放');
  if (type === 'employee-models') return employeeModels.open(id);
  if (await workspace.action(type, id)) return;
  if (type === "new-native-thread") {
    show('新建员工会话', '<p>为 ' + esc(name(id)) + ' 在现有 Codex 中创建新会话，并替换当前关联。员工身份与历史保留；旧会话中的工作继续由 Codex 管理。</p><form data-form="new-native-thread" data-id="' + esc(id) + '"><label class="confirmation-check"><input type="checkbox" name="confirmed" required>新会话创建成功后替换关联。</label><div class="error" role="alert"></div><div class="modal-footer">' + btn('新建并绑定', 'submit', '', true) + '</div></form>'); return;
  }
  if (type === "review-hook") return reviewHook();
  if (type === 'delivery') { const r=S.requests.find(r=>r.id===id); if(r)show('投递与回执',deliveryDetails(r,S,{esc,time,native})); return; }
  if (type === "reconnect") { await api('/api/connection/reconnect', {}); await refresh(); render(); toast(S.health.connection?.online ? 'Codex 连接已核验' : S.health.connection?.error || '等待连接'); return; }
  if (type === "launch-codex") { show('以共享接入启动 Codex', '<p>请先在 Codex 中正常退出应用。确认后，TeamDesk 会以共享连接启动同一个桌面应用，员工继续使用现有任务、插件和权限。</p><p class="help spacer">直接从系统再次打开 Codex 可恢复默认启动方式。本操作不创建自动化，也不强制结束正在运行的任务。</p><form data-form="launch-codex"><label class="confirmation-check"><input required type="checkbox" name="confirmed">我已退出 Codex，现在以共享接入启动。</label><div class="error" role="alert"></div><div class="modal-footer">' + btn('启动 Codex', 'submit', '', true) + '</div></form>'); return; }
  if (type === "task-filter") {
    const target = "#tasks?filter=" + encodeURIComponent(id);
    filters = { select: id };
    if (location.hash === target) render();
    else location.hash = target;
    return;
  }
  if (type === "nav") {
    location.hash = id;
    return;
  }
  if (type === "mobile") {
    mobile = !mobile;
    render();
    return;
  }
  if (type === "close") {
    close();
    return;
  }
  if (type === "soon") {
    show(
      id,
      '<div class="empty-state"><h3>Coming soon</h3><p>入口已保留，当前 MVP 尚未提供此功能。</p></div>',
    );
    return;
  }
  if (type === "filter") {
    filters.search = $("#filter-search")?.value || "";
    filters.select = $("#filter-select")?.value || "all";
    if (route === "tasks") history.replaceState(null, "", "#tasks" + (filters.select === "all" ? "" : "?filter=" + encodeURIComponent(filters.select)));
    render();
    return;
  }
  if (type === "new-employee" || type === "edit-employee")
    return employeeForm(id);
  if (type === "employee") return employeeDetail(id);
  if (type === "new-task") return inputForm(id);
  if (type === "steer") return inputForm("", id);
  if (type === "task") return taskDetail(id);
  if (type === "record") return recordDetail(id);
  if (type === "decision") return decisionDetail(id);
  if (type === "option") {
    dialog.querySelector('textarea[name="answer"]').value = id;
    return;
  }
  if (type === "submit") {
    dialog.querySelector("form")?.requestSubmit();
    return;
  }
  if (type === "archive") {
    const e = S.employees.find((e) => e.id === id);
    show(
      e.archived ? "恢复员工" : "归档员工",
      "<p>员工身份、任务和历史记录都会保留。" +
        (e.archived
          ? "恢复后重新执行接入探测。"
          : "新输入和待投递操作暂停；原生任务已开始的工作继续由 Codex 管理。") +
        '</p><form data-form="archive" data-id="' +
        id +
        '"><div class="error" role="alert"></div><div class="modal-footer">' +
        btn("确认" + (e.archived ? "恢复" : "归档"), "submit", "", true) +
        "</div></form>",
    );
    return;
  }
  if (type === "bind" || type === "choose-bridge") {
    const list = (await loadCatalog()).filter(
      (t) =>
        !S.employees.some(
          (e) => !e.archived && e.id !== id && e.threadId === t.id,
        ),
    );
    show(
      type === "bind" ? "选择原生任务" : "选择原生接入任务",
      '<form data-form="' +
        type +
        '" data-id="' +
        esc(id) +
        '">' +
        nativeSelect(
          list,
          type === "bind"
            ? S.employees.find((e) => e.id === id)?.threadId
            : S.settings.bridgeThreadId,
        ) +
        '<p class="help">' +
        (type === "bind"
          ? "换绑保存历史，旧会话不再自动记账。"
          : "选择后还需向该任务发送连接说明，原生任务才能开始接入。") +
        '</p><div class="error" role="alert"></div><div class="modal-footer">' +
        btn("保存关联", "submit", "", true) +
        (type === "bind" ? btn("新建会话并绑定", "new-native-thread", id) : "") +
        "</div></form>",
    );
    return;
  }
  if (type === "probe") {
    await api("/api/employees/" + id + "/probe", {});
    toast("探测已提交，正在送入 Codex");
    close();
    return;
  }
  if (type === "toggle") {
    await api("/api/settings", { enabled: !S.settings.enabled });
    await refresh();
    toast(S.settings.enabled ? "已恢复派发和记账" : "已暂停派发和记账");
    return;
  }
  if (["retry", "cancel-op", "reconcile"].includes(type)) {
    await api("/api/operations/" + id + "/recover", {
      action: type === "retry" ? "retry" : type === "reconcile" ? "reconcile" : "cancel",
    });
    await refresh();
    toast("恢复操作已保存");
    return;
  }
  if (type === "accept" || type === "reject") {
    const t = S.tasks.find((t) => t.id === id);
    show(
      type === "accept" ? "人类验收通过" : "退回负责人整改",
      '<form data-form="accept" data-id="' +
        id +
        '" data-revision="' +
        t.revision +
        '" data-collaboration-revision="' + (t.collaborationRevision || 0) +
        '" data-verdict="' +
        (type === "accept" ? "accepted" : "rejected") +
        '"><p>业务 ' +
        esc(t.businessId) +
        " · 当前证据版本 " +
        t.revision +
        "</p>" +
        field(
          type === "accept" ? "验收说明（选填）" : "需要整改什么",
          '<textarea name="note" rows="4" maxlength="4000" ' +
            (type === "reject" ? "required" : "") +
            "></textarea>",
        ) +
        '<div class="error" role="alert"></div><div class="modal-footer">' +
        '<p class="help">' + (type === "accept" ? "结论和说明会发送给负责人，请其确认收到；验收通过不会自动创建下一项工作。" : "结论和说明会发送给负责人，作为此任务的整改输入。") + '</p>' +
        btn("确认并通知负责人", "submit", "", true) +
        "</div></form>",
    );
    return;
  }
  if (type === "directory") {
    show(
      "团队共享目录",
      '<p class="mono">' +
        esc(S.health.dataDirectory) +
        '</p><ul class="steps"><li>teamdesk.sqlite：员工、绑定、任务、业务输入、摘要与审计。</li><li>artifacts/：员工提供的交付物。</li><li>server.log / runtime.json：本地服务运行信息。</li></ul><p class="help">正常对话、推理、原始工具输出仍留在 Codex。使用“导出 metadata”保存可阅读的 JSON 快照。备份数据库时先停止本地服务和原生接入。</p>',
    );
    return;
  }
  if (type === "export") {
    const j = await api("/api/export"),
      blob = new Blob([JSON.stringify(j, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download =
      "teamdesk-metadata-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("已导出 metadata（包含你提交的业务输入）");
    return;
  }
  if (type === "skills") {
    const j = await api("/api/skills?refresh=1");
    show(
      "本机可用技能",
      '<div class="search-results">' +
        j.skills
          .map(
            (s) =>
              '<div class="card-body"><strong>' +
              esc(s.name) +
              '</strong><p class="source">' +
              esc(s.source) +
              '</p><p class="mono">' +
              esc(s.path) +
              "</p></div>",
          )
          .join("") +
        "</div>",
    );
    return;
  }
  if (type === "copy-connect") {
    await navigator.clipboard.writeText($("#connection-prompt").textContent);
    toast("已复制，发送到选定的原生接入任务");
    return;
  }
  if (type === "search") {
    show(
      "查找员工或任务",
      '<label class="field"><input id="global-search" aria-label="查找内容" placeholder="输入名字、编号或任务名称"></label><div id="global-results" class="search-results"></div>',
    );
    return;
  }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  if (b.dataset.action === "submit") return;
  e.preventDefault();
  action(b.dataset.action, b.dataset.id).catch((err) => toast(err.message));
});
document.addEventListener("change", (e) => {
  const f = e.target.form;
  if (f?.dataset.form === "employee" && e.target.name === "bindingMode") {
    $("#existing-binding").hidden = e.target.value === "new";
  }
  if (f?.dataset.form === "input") {
    if (e.target.name === "employeeId") {
      const chosen = [
        ...f.querySelectorAll('input[name="participants"]:checked'),
      ].map((input) => input.value);
      $("#participant-choices").innerHTML = participantChoices(
        e.target.value,
        chosen,
      );
      $("#steer-target").innerHTML = taskSelect(e.target.value, "");
    }
    toggleMode();
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "global-search") {
    const q = e.target.value.toLowerCase();
    $("#global-results").innerHTML = [
      ...S.employees
        .filter((x) =>
          (x.name + " " + x.role + " " + x.id).toLowerCase().includes(q),
        )
        .map((x) => btn(x.name + " · " + x.role, "employee", x.id)),
      ...S.tasks
        .filter((x) => (x.title + " " + x.businessId).toLowerCase().includes(q))
        .map((x) => btn(x.title, "task", x.id)),
    ].join("");
  }
});
document.addEventListener("submit", async (e) => {
  const f = e.target;
  if (!f.dataset.form) return;
  e.preventDefault();
  if (submitting) return;
  submitting = true;
  const submitButtons = f.querySelectorAll("button");
  submitButtons.forEach((b) => (b.disabled = true));
  const values = Object.fromEntries(new FormData(f)),
    id = f.dataset.id,
    kind = f.dataset.form;
  f.dataset.requestKey ||= crypto.randomUUID();
  try {
    let url,
      payload = values;
    if (kind === "employee") {
      url = id ? "/api/employees/" + id + "/edit" : "/api/employees";
      payload.skills = new FormData(f).getAll("skills");
      if (id) payload.departmentRevision = Number(f.dataset.departmentRevision);
    }
    if (kind === "department") { url = id ? '/api/departments/' + id + '/edit' : '/api/departments'; payload.revision = Number(f.dataset.revision); }
    if (kind === 'employee-department') { url = '/api/employees/' + id + '/department'; payload = {departmentId:values.departmentId || null,revision:Number(f.dataset.revision)}; }
    if (kind === 'department-delete') {
      url = '/api/departments/' + id + '/delete'; payload = {revision:Number(f.dataset.revision),members:JSON.parse(f.dataset.members)};
      if (values.targetDepartmentId) payload.targetDepartmentId = values.targetDepartmentId === 'unassigned' ? null : values.targetDepartmentId;
    }
    if (kind === "resource") { url = id ? '/api/resources/' + id + '/edit' : '/api/resources'; payload.revision = Number(f.dataset.revision); }
    if (['resource-delete','resource-restore','resource-publish'].includes(kind)) { url = '/api/resources/' + id + '/' + kind.split('-')[1]; payload = {revision:Number(f.dataset.revision)}; }
    if (kind === "input") {
      url = "/api/inputs";
      payload.participants = new FormData(f).getAll("participants");
      if (payload.mode === "steer") payload.expectedTurnId = S.employees.find(e => e.id === payload.employeeId)?.activeTurnId || null;
    }
    if (kind === "new-native-thread") { url = '/api/employees/' + id + '/new-thread'; payload = { confirmed: values.confirmed === 'on' }; }
    if (kind === "hook-trust") { url = '/api/hooks/trust'; payload = { ticket: f.dataset.ticket, confirmed: values.confirmed === 'on' }; }
    if (kind === "launch-codex") { url = '/api/connection/launch'; payload = { confirmed: values.confirmed === 'on' }; }
    if (kind === "native-decision") {
      url = '/api/decisions/' + id + '/native-answer';
      payload = { revision: Number(f.dataset.revision), decision: values.decision, answers: Object.fromEntries(Object.entries(values).filter(([k]) => k.startsWith('question:')).map(([k,v]) => [k.slice(9),v])) };
    }
    if (kind === "settings") url = "/api/settings";
    if (kind === "archive") {
      url = "/api/employees/" + id + "/archive";
      payload = { archived: !S.employees.find((e) => e.id === id).archived };
    }
    if (kind === "bind") url = "/api/employees/" + id + "/bind";
    if (kind === "choose-bridge") {
      url = "/api/settings";
      payload = { bridgeThreadId: values.threadId };
    }
    if (kind === "decision") {
      url = "/api/decisions/" + id + "/answer";
      payload.revision = Number(f.dataset.revision);
    }
    if (kind === "accept") {
      url = "/api/tasks/" + id + "/accept";
      payload.verdict = f.dataset.verdict;
      payload.revision = Number(f.dataset.revision);
      payload.collaborationRevision = Number(f.dataset.collaborationRevision);
    }
    const signature = JSON.stringify(payload);
    if (f.dataset.lastPayload && f.dataset.lastPayload !== signature)
      f.dataset.requestKey = crypto.randomUUID();
    f.dataset.lastPayload = signature;
    await api(url, payload, f.dataset.requestKey);
    if (dialog.open) dialog.close();
    await refresh();
    render();
    toast(kind === 'resource' ? '草案已保存，确认发布后才生效' : kind === 'resource-delete' ? '资料已删除，历史版本保留' : kind === 'resource-restore' ? '已恢复为草案，发布前员工不可查询' : kind === 'resource-publish' ? '资料已发布，员工下次查询可用' : kind === 'department-delete' ? '部门已删除，可从“已删除部门”恢复' : kind === 'employee-department' ? (payload.departmentId ? '员工已转入新部门' : '员工已移出部门，当前未分配') : kind === "input" ? "已提交，原生接收状态会自动更新" : kind === "hook-trust" ? "原生信任已核验，入职检查将自动继续" : "已保存");
    if (kind === "employee" && !S.health.hookTrust.recorded && S.health.connection?.online) await reviewHook();
  } catch (err) {
    f.querySelector(".error").textContent = err.message;
  } finally {
    submitting = false;
    submitButtons.forEach((b) => (b.disabled = false));
  }
});
window.addEventListener("hashchange", () => {
  const target = readRoute();
  route = target.page;
  filters = route === "tasks" && target.filter ? { select: target.filter } : {};
  mobile = false;
  if (dialog.open) dialog.close();
  render();
  window.scrollTo(0, 0);
});
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    action("search");
  }
  if (e.key === "Enter" && e.target.id === "filter-search") action("filter");
});
dialog.addEventListener("close", () => {
  const action = lastFocus?.dataset.action,
    id = lastFocus?.dataset.id;
  render();
  const target = action
    ? [...document.querySelectorAll("[data-action]")].find(
        (e) => e.dataset.action === action && e.dataset.id === id,
      )
    : null;
  (target || document.querySelector("#main"))?.focus();
});
try {
  await refresh();
} catch (e) {
  $("#app").innerHTML =
    '<main class="main"><h1>本地工作台暂不可用</h1><p>' +
    esc(e.message) +
    "</p><p>重新运行插件的 launch.sh start，然后刷新页面。</p></main>";
}
const stream = new EventSource('/api/stream');
let refreshTimer;
const scheduleRefresh = () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh().catch(() => toast('本地服务暂不可用，当前显示最近同步的数据')), 180);
};
stream.addEventListener('changed', scheduleRefresh);
stream.addEventListener('connected', () => refresh(true, true).catch(() => toast('正在恢复本地连接')));
stream.onerror = () => { const b = document.querySelector('.status-banner'); if (b) b.textContent = '与本地工作台重新连接中，数据已保存。'; };
window.addEventListener('focus', scheduleRefresh);
