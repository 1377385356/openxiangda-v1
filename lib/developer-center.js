const crypto = require('crypto');
const http = require('http');

const MAX_BODY_BYTES = 1024 * 1024;

function json(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(
          chunks.length > 0
            ? JSON.parse(Buffer.concat(chunks).toString('utf8'))
            : {}
        );
      } catch {
        reject(new Error('request body must be valid JSON'));
      }
    });
    request.on('error', reject);
  });
}

function studioHtml(sessionToken) {
  const token = JSON.stringify(sessionToken);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>OpenXiangda Developer Center</title>
  <style>
    :root{font-family:Inter,"PingFang SC",system-ui,sans-serif;color:#f7f7f5;background:#111210;--muted:#9b9e96;--line:#2c2e29;--panel:#181a17;--pre:#f0b849;--prod:#5fc49f;--bad:#ee776f}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 80% -10%,#29352e 0,transparent 38%),#111210}
    main{max-width:1240px;margin:auto;padding:36px 28px 64px}.eyebrow{color:#a9c7b8;font-size:12px;letter-spacing:.16em;text-transform:uppercase}
    header{display:flex;justify-content:space-between;gap:24px;align-items:end;margin:10px 0 30px}h1{font-size:clamp(30px,4vw,54px);letter-spacing:-.045em;margin:0;font-weight:620}
    .repo{color:var(--muted);font:13px ui-monospace,SFMono-Regular,monospace;text-align:right}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
    .card{background:color-mix(in srgb,var(--panel) 94%,transparent);border:1px solid var(--line);border-radius:18px;padding:22px;box-shadow:0 18px 50px #0004}
    .env{position:relative;overflow:hidden}.env:before{content:"";position:absolute;inset:0 auto 0 0;width:4px;background:var(--accent)}
    .pre{--accent:var(--pre)}.prod{--accent:var(--prod)}.card-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}
    h2{font-size:19px;margin:0}.badge{border:1px solid color-mix(in srgb,var(--accent) 45%,var(--line));color:var(--accent);padding:5px 9px;border-radius:999px;font-size:11px;letter-spacing:.08em}
    dl{display:grid;grid-template-columns:130px 1fr;gap:11px;margin:0;font-size:13px}dt{color:var(--muted)}dd{margin:0;font-family:ui-monospace,SFMono-Regular,monospace;overflow-wrap:anywhere}
    .wide{grid-column:1/-1}.toolbar{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}.gate-ok{color:var(--prod)}.gate-bad{color:var(--bad)}button{appearance:none;border:1px solid #3a3d36;background:#22241f;color:#f4f4ef;padding:10px 14px;border-radius:10px;font-weight:600;cursor:pointer}
    button:hover{border-color:#777c70}button.primary{background:#e9efe9;color:#111;border-color:#e9efe9}button.danger{color:#ffaaa3;border-color:#70423e}
    button:disabled{opacity:.4;cursor:not-allowed}.status{display:flex;gap:8px;align-items:center;color:var(--muted);font-size:13px}.dot{width:8px;height:8px;border-radius:50%;background:var(--prod);box-shadow:0 0 14px var(--prod)}
    pre{white-space:pre-wrap;word-break:break-word;background:#10110f;border:1px solid #252722;border-radius:12px;padding:16px;color:#c7cbc2;max-height:300px;overflow:auto;font:12px/1.55 ui-monospace,SFMono-Regular,monospace}
    dialog{border:1px solid var(--line);border-radius:18px;background:#1a1c18;color:#fff;padding:24px;max-width:520px;box-shadow:0 30px 100px #000a}dialog::backdrop{background:#000a}
    input,textarea,select{width:100%;background:#111210;color:#fff;border:1px solid #3a3d36;border-radius:9px;padding:10px;margin:7px 0 14px}
    @media(max-width:760px){.grid{grid-template-columns:1fr}.wide{grid-column:auto}header{align-items:start;flex-direction:column}.repo{text-align:left}main{padding:24px 16px}}
  </style>
</head>
<body>
<main>
  <div class="eyebrow">Local delivery control plane</div>
  <header><h1>OpenXiangda<br/>Developer Center</h1><div class="repo" id="repo">正在读取工作区…</div></header>
  <section class="grid">
    <article class="card env pre"><div class="card-head"><h2>预发环境</h2><span class="badge">PREPRODUCTION</span></div><dl id="pre"></dl></article>
    <article class="card env prod"><div class="card-head"><h2>正式环境</h2><span class="badge">PRODUCTION</span></div><dl id="prod"></dl></article>
    <article class="card wide"><div class="card-head"><h2>交付门禁与环境差异</h2><span class="badge" id="gate-badge">CHECKING</span></div><dl id="gates"></dl></article>
    <article class="card wide"><div class="card-head"><h2>交付状态</h2><div class="status"><span class="dot"></span><span id="health">连接中</span></div></div><div class="toolbar">
      <button data-action="candidate">生成候选</button><button data-action="deploy">部署预发</button><button data-action="test">登记测试证据</button><button class="primary" data-action="promote">晋级正式</button><button class="danger" data-action="rollback">准备回退</button><button data-action="refresh">刷新</button>
    </div><pre id="output">Developer Center 只监听 127.0.0.1；所有动作复用 OpenXiangda CLI 门禁。</pre></article>
  </section>
</main>
<dialog id="dialog"><form method="dialog"><h2 id="dialog-title">执行操作</h2><label>候选版本 / Change / Release 参数</label><input id="value" autocomplete="off"/><label>测试证据 JSON 或回退原因（按操作需要）</label><textarea id="details" rows="8"></textarea><div class="toolbar"><button value="cancel">取消</button><button class="primary" id="confirm" value="default">确认执行</button></div></form></dialog>
<script>
const token=${token}; history.replaceState(null,"",location.pathname);
const out=document.querySelector("#output"), dialog=document.querySelector("#dialog");
let status=null, pending=null;
const esc=v=>String(v??"-").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c]));
const rows=e=>[["appType",e?.appType],["环境修订",e?.revision],["公开地址",e?.publicOrigin],["AppRelease",e?.heads?.appReleaseId],["RuntimeRelease",e?.heads?.runtimeReleaseId],["BackendRelease",e?.heads?.backendReleaseId],["PageRelease",e?.heads?.pageReleaseId],["WorkflowRelease",e?.heads?.workflowReleaseId],["候选版本",e?.latestDeployment?.candidateId],["Deployment",e?.latestDeployment?.id],["部署状态",e?.latestDeployment?.status],["测试证据",e?.latestDeployment?.evidenceHash],["证据有效期",e?.latestDeployment?.evidenceSummary?.validUntil],["副作用策略",JSON.stringify(e?.sideEffectPolicy||{})]].map(([k,v])=>\`<dt>\${esc(k)}</dt><dd>\${esc(v)}</dd>\`).join("");
const bool=v=>\`<span class="\${v?"gate-ok":"gate-bad"}">\${v?"通过":"阻断"}</span>\`;
const gateRows=s=>[["权威主线",s?.git?.upstream||"-"],["远端主线提交",s?.git?.remoteHeadCommit],["ahead / behind",\`\${s?.git?.ahead??"-"} / \${s?.git?.behind??"-"}\`],["工作区干净",bool(Boolean(s?.git?.clean))],["其他脏 worktree",s?.git?.dirtyWorktrees?.length?s.git.dirtyWorktrees.join(", "):bool(true)],["Candidate 门禁",bool(Boolean(s?.deliveryGates?.candidateReady))],["预发测试证据",bool(Boolean(s?.deliveryGates?.evidenceValid))],["正式 commissioning",bool(Boolean(s?.deliveryGates?.productionCommissioning))],["同一 AppRelease",bool(Boolean(s?.drift?.sameAppRelease))],["资源差异",s?.drift?.sameAppRelease?"无":"存在（预发/正式 Release Head 不同）"],["OpenXiangda",s?.openxiangdaVersion]].map(([k,v])=>\`<dt>\${esc(k)}</dt><dd>\${typeof v==="string"&&v.startsWith("<span")?v:esc(v)}</dd>\`).join("");
async function api(path,options={}){const r=await fetch(path,{...options,headers:{"content-type":"application/json","x-openxiangda-studio-token":token,...options.headers}});const j=await r.json();if(!r.ok)throw new Error(j.message||"request failed");return j}
async function refresh(){try{status=await api("/api/status");document.querySelector("#repo").textContent=\`\${status.git?.branch||"-"} @ \${(status.git?.commit||"-").slice(0,12)} · \${status.git?.mainlineAligned?"mainline ready":status.git?.clean?"clean / not aligned":"dirty"}\`;document.querySelector("#pre").innerHTML=rows(status.remote?.environments?.find(e=>e.kind==="preproduction"));document.querySelector("#prod").innerHTML=rows(status.remote?.environments?.find(e=>e.kind==="production"));document.querySelector("#gates").innerHTML=gateRows(status);const ready=Boolean(status.deliveryGates?.candidateReady);const badge=document.querySelector("#gate-badge");badge.textContent=ready?"READY":"BLOCKED";badge.className=\`badge \${ready?"gate-ok":"gate-bad"}\`;document.querySelector('[data-action="candidate"]').disabled=!ready;document.querySelector('[data-action="deploy"]').disabled=!ready;document.querySelector('[data-action="test"]').disabled=!status.deliveryGates?.testRegistrationReady;document.querySelector('[data-action="promote"]').disabled=!status.deliveryGates?.promotionReady;document.querySelector('[data-action="rollback"]').disabled=!status.deliveryGates?.rollbackReady;document.querySelector("#health").textContent="状态已同步";}catch(e){document.querySelector("#health").textContent="读取失败";out.textContent=e.message}}
document.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>{pending=b.dataset.action;if(pending==="refresh")return refresh();document.querySelector("#dialog-title").textContent=b.textContent;document.querySelector("#value").value="";document.querySelector("#details").value=pending==="test"?JSON.stringify({outcome:"passed",requiredGates:["static","schema","appFunctions","roles","browser","lifecycle","cleanup"],results:{static:{status:"passed"},schema:{status:"passed"},appFunctions:{status:"passed"},roles:{status:"passed"},browser:{status:"passed"},lifecycle:{status:"passed"},cleanup:{status:"passed"}},cleanup:{passed:true,residueCount:0}},null,2):"";dialog.showModal()});
document.querySelector("#confirm").onclick=async e=>{e.preventDefault();const action=pending;dialog.close();out.textContent="执行中…";try{const result=await api("/api/action",{method:"POST",body:JSON.stringify({action,value:document.querySelector("#value").value,details:document.querySelector("#details").value,confirmProduction:["promote","rollback"].includes(action)})});out.textContent=JSON.stringify(result,null,2);await refresh()}catch(error){out.textContent=error.message}};
refresh();
</script>
</body></html>`;
}

async function startDeveloperCenter(options = {}) {
  const host = '127.0.0.1';
  const token = options.token || crypto.randomBytes(32).toString('base64url');
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://${host}`);
    if (
      request.method === 'GET' &&
      url.pathname === '/' &&
      url.searchParams.get('session') === token
    ) {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy':
          "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        'x-frame-options': 'DENY',
        'x-content-type-options': 'nosniff',
      });
      response.end(studioHtml(token));
      return;
    }
    if (request.headers['x-openxiangda-studio-token'] !== token) {
      json(response, 401, { message: 'invalid studio session' });
      return;
    }
    try {
      if (request.method === 'GET' && url.pathname === '/api/status') {
        json(response, 200, await options.getStatus());
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/action') {
        const body = await readJsonBody(request);
        json(response, 200, await options.runAction(body));
        return;
      }
      json(response, 404, { message: 'not found' });
    } catch (error) {
      json(response, 400, {
        code: error?.code || 'STUDIO_ACTION_FAILED',
        message: error?.message || String(error),
      });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(options.port || 0), host, resolve);
  });
  const address = server.address();
  const url = `http://${host}:${address.port}/?session=${encodeURIComponent(
    token
  )}`;
  return { server, token, url, host, port: address.port };
}

module.exports = {
  startDeveloperCenter,
  studioHtml,
};
