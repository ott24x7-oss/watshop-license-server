/**
 * Inline HTML views. Brand colors hard-coded (Forest Ink #0F1F1A, Signal Green #34C77B,
 * Linen #F4F1EA, Page #FBFAF7, Slate #5A6B66).
 */

export function escapeHtml(s: unknown): string {
	if (s === null || s === undefined) return "";
	return String(s)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

const e = escapeHtml;

const STYLES = `
:root {
	--forest: #0F1F1A;
	--green: #34C77B;
	--green-bright: #5DE89B;
	--green-deep: #2BAE69;
	--linen: #F4F1EA;
	--page: #FBFAF7;
	--slate: #5A6B66;
	--card: #16302A;
	--border: rgba(244,241,234,0.08);
	--danger: #E5484D;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
	background: var(--forest);
	color: var(--page);
	font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	font-size: 14px;
	min-height: 100vh;
	-webkit-font-smoothing: antialiased;
}
a { color: var(--green); text-decoration: none; }
a:hover { color: var(--green-bright); }
code, pre { font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace; }

.layout { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
.sidebar {
	background: #0A1714;
	border-right: 1px solid var(--border);
	padding: 24px 16px;
	display: flex; flex-direction: column; gap: 4px;
}
.brand {
	display: flex; align-items: center; gap: 8px;
	padding: 6px 8px 24px; font-weight: 700; font-size: 16px;
}
.brand .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--green); }
.nav a {
	display: flex; padding: 8px 12px; border-radius: 8px;
	color: var(--linen); font-weight: 500; font-size: 13px;
	transition: background 0.12s;
}
.nav a:hover { background: rgba(244,241,234,0.06); }
.nav a.active { background: rgba(52,199,123,0.12); color: var(--green-bright); }
.spacer { flex: 1; }
.sidebar form { margin: 0; }
.sidebar form button {
	width: 100%; padding: 8px 12px; border-radius: 8px;
	background: transparent; border: 1px solid var(--border); color: var(--slate);
	font: inherit; cursor: pointer; text-align: left;
}
.sidebar form button:hover { color: var(--page); border-color: var(--page); }

.main { padding: 32px 40px; max-width: 1100px; }
h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; letter-spacing: -0.01em; }
h2 { font-size: 16px; font-weight: 600; margin: 24px 0 12px; }
.subtitle { color: var(--slate); font-size: 13px; margin-bottom: 28px; }

.card {
	background: var(--card);
	border: 1px solid var(--border);
	border-radius: 12px;
	padding: 20px;
	margin-bottom: 16px;
}

.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.stat-card {
	background: var(--card); border: 1px solid var(--border); border-radius: 12px;
	padding: 16px;
}
.stat-card .label { color: var(--slate); font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; }
.stat-card .value { font-size: 28px; font-weight: 700; margin-top: 4px; letter-spacing: -0.02em; }
.stat-card .value.green { color: var(--green); }
.stat-card .value.red { color: var(--danger); }

.row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.row label { font-size: 12px; color: var(--slate); width: 120px; flex-shrink: 0; }
input[type=text], input[type=email], input[type=password], input[type=number], textarea, select {
	background: rgba(0,0,0,0.25);
	border: 1px solid var(--border);
	border-radius: 8px;
	padding: 8px 10px;
	font: inherit;
	color: var(--page);
	width: 100%;
}
input:focus, textarea:focus, select:focus { outline: none; border-color: var(--green); }
textarea { min-height: 80px; resize: vertical; }
button.primary, .btn-primary {
	background: var(--green); color: var(--forest);
	border: none; border-radius: 8px;
	padding: 9px 18px; font-weight: 600; font: inherit;
	cursor: pointer; font-size: 13px;
}
button.primary:hover { background: var(--green-bright); }
button.danger {
	background: transparent; color: var(--danger);
	border: 1px solid var(--danger); border-radius: 8px;
	padding: 6px 12px; font-weight: 500; font: inherit; cursor: pointer; font-size: 12px;
}
button.danger:hover { background: rgba(229,72,77,0.12); }
button.ghost {
	background: transparent; color: var(--linen);
	border: 1px solid var(--border); border-radius: 8px;
	padding: 6px 12px; font: inherit; cursor: pointer; font-size: 12px;
}
button.ghost:hover { border-color: var(--linen); }

table { width: 100%; border-collapse: collapse; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); font-size: 13px; }
th { color: var(--slate); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
td.mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
tr:hover td { background: rgba(244,241,234,0.02); }

.badge {
	display: inline-block; padding: 2px 8px; border-radius: 999px;
	font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
}
.badge.active { background: rgba(52,199,123,0.18); color: var(--green-bright); }
.badge.revoked { background: rgba(229,72,77,0.18); color: var(--danger); }
.badge.removed { background: rgba(244,241,234,0.10); color: var(--slate); }

.flash {
	padding: 10px 14px; border-radius: 8px; margin-bottom: 16px;
	font-size: 13px; border: 1px solid;
}
.flash.success { background: rgba(52,199,123,0.10); border-color: rgba(52,199,123,0.4); color: var(--green-bright); }
.flash.error { background: rgba(229,72,77,0.10); border-color: rgba(229,72,77,0.4); color: var(--danger); }

.copy-row {
	display: flex; align-items: center; gap: 8px;
	background: rgba(0,0,0,0.25); border: 1px solid var(--border);
	border-radius: 8px; padding: 10px 12px;
	font-family: 'JetBrains Mono', monospace; font-size: 13px;
	word-break: break-all;
}
.copy-row button {
	background: var(--green); color: var(--forest); border: none; border-radius: 6px;
	padding: 4px 10px; font: inherit; font-size: 11px; cursor: pointer; flex-shrink: 0;
}

.muted { color: var(--slate); font-size: 12px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }

/* Login */
.login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
.login-card { width: 100%; max-width: 380px; background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 32px; }
.login-card h1 { margin-bottom: 24px; text-align: center; }
.login-card .row label { width: auto; }
.login-card button.primary { width: 100%; margin-top: 8px; padding: 11px 18px; }
`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">`;

export function layout(opts: {
	title: string;
	body: string;
	active?: string;
	flash?: { kind: "success" | "error"; text: string } | null;
}): string {
	const flash = opts.flash
		? `<div class="flash ${e(opts.flash.kind)}">${e(opts.flash.text)}</div>`
		: "";

	const active = opts.active ?? "";
	const link = (href: string, label: string, key: string) =>
		`<a class="${active === key ? "active" : ""}" href="${href}">${label}</a>`;

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(opts.title)} · WatShop Studio</title>
${FONTS}
<style>${STYLES}</style>
</head>
<body>
<div class="layout">
	<aside class="sidebar">
		<div class="brand"><span class="dot"></span> watshop studio</div>
		<nav class="nav">
			${link("/admin", "Dashboard", "dashboard")}
			${link("/admin/licenses", "Licenses", "licenses")}
			${link("/admin/licenses/new", "New license", "new-license")}
			${link("/admin/integration", "Integration", "integration")}
			${link("/admin/account", "Account", "account")}
		</nav>
		<div class="spacer"></div>
		<form method="post" action="/admin/logout">
			<button type="submit">Sign out</button>
		</form>
	</aside>
	<main class="main">
		${flash}
		${opts.body}
	</main>
</div>
</body>
</html>`;
}

export function loginPage(error?: string): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in · WatShop Studio</title>
${FONTS}
<style>${STYLES}</style>
</head>
<body>
<div class="login-wrap">
	<div class="login-card">
		<h1><span style="color:var(--green)">·</span> watshop studio</h1>
		${error ? `<div class="flash error">${e(error)}</div>` : ""}
		<form method="post" action="/admin/login">
			<div class="row"><label>Username</label></div>
			<input type="text" name="username" autofocus required autocomplete="username" style="margin-bottom:12px">
			<div class="row"><label>Password</label></div>
			<input type="password" name="password" required autocomplete="current-password" style="margin-bottom:8px">
			<button type="submit" class="primary">Sign in</button>
		</form>
	</div>
</div>
</body>
</html>`;
}

export { e as h };
