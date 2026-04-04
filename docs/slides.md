---
marp: true
theme: default
paginate: true
size: 16:9
html: true
style: |
  /* Solana-inspired theme for Marp
     Primary:   #9945FF (Solana Purple)
     Secondary: #14F195 (Solana Green/Mint)
     Accent:    #00C2FF (Cyan)
     Dark BG:   #0A0A1A
  */

  /* =========================================
     Base
     ========================================= */
  section {
    --accent:      #9945FF;
    --accent-warm: #14F195;
    --dark:        #0A0A1A;
    --dark-2:      #13102A;
    --muted:       #8B8FAD;
    --border:      #2A2550;
    --bg-subtle:   #110F2A;

    width: 1280px;
    height: 720px;
    box-sizing: border-box;
    font-family: 'Hiragino Sans', 'BIZ UDGothic', 'Yu Gothic Medium',
                 'Noto Sans JP', 'Segoe UI', -apple-system, sans-serif;
    background: #0D0B21;
    color: #FFFFFF !important;
    padding: 48px 72px 58px;
    font-size: 24px;
    line-height: 1.65;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  section p,
  section li,
  section span {
    color: #FFFFFF;
  }

  section::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 4px;
    background: linear-gradient(90deg, #9945FF, #00C2FF, #14F195);
  }

  section::after {
    font-size: 0.5em;
    color: rgba(153, 69, 255, 0.6);
    bottom: 20px;
    right: 40px;
    letter-spacing: 0.04em;
  }

  /* =========================================
     Typography
     ========================================= */
  h1 {
    font-size: 2.0em;
    font-weight: 800;
    color: #FFFFFF;
    margin: 0 0 14px;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  h2 {
    font-size: 1.45em;
    font-weight: 700;
    color: #FFFFFF;
    margin: 0 0 18px;
    padding-bottom: 10px;
    border-bottom: 3px solid var(--accent);
    line-height: 1.3;
  }

  h3 {
    font-size: 1.05em;
    font-weight: 600;
    color: #14F195;
    margin: 14px 0 8px;
  }

  p { margin: 8px 0; }

  ul, ol { margin: 8px 0; padding-left: 1.4em; }
  li { margin: 5px 0; }
  ul > li::marker { color: var(--accent); font-size: 1.1em; }
  ol > li::marker { color: var(--accent); font-weight: 700; }

  strong { color: #D4AAFF !important; font-weight: 700; }
  em     { color: #14F195 !important; font-style: normal; font-weight: 600; }

  /* =========================================
     Code
     ========================================= */
  code {
    font-family: 'JetBrains Mono', 'Fira Code', 'Source Code Pro', monospace;
    background: rgba(153, 69, 255, 0.15);
    border: 1px solid rgba(153, 69, 255, 0.4);
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 0.82em;
    color: #14F195;
  }

  pre {
    background: #080618;
    border: 1px solid rgba(153, 69, 255, 0.3);
    border-radius: 10px;
    padding: 18px 22px;
    margin: 10px 0;
    flex-shrink: 0;
  }

  pre code {
    background: none;
    border: none;
    color: #C8BEFF;
    padding: 0;
    font-size: 0.75em;
    line-height: 1.6;
  }

  /* =========================================
     Table
     ========================================= */
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 10px 0;
    font-size: 0.88em;
  }

  th {
    background: linear-gradient(90deg, #9945FF, #6D28D9);
    color: white;
    padding: 8px 14px;
    text-align: left;
    font-weight: 600;
  }

  td {
    padding: 7px 14px;
    border-bottom: 1px solid var(--border);
    color: #FFFFFF !important;
  }

  section table,
  section table thead,
  section table tbody,
  section table tr {
    background: transparent !important;
  }

  section table td,
  section table td p,
  section table td span,
  section table td strong,
  section table td code {
    color: #FFFFFF !important;
    background: transparent !important;
  }

  tr:nth-child(even) td { background: rgba(153, 69, 255, 0.07) !important; }

  /* =========================================
     Blockquote
     ========================================= */
  blockquote {
    border-left: 4px solid #14F195;
    background: rgba(20, 241, 149, 0.06);
    margin: 10px 0;
    padding: 10px 18px;
    border-radius: 0 6px 6px 0;
    color: #A8FFD8;
    font-size: 0.95em;
  }

  hr {
    border: none;
    border-top: 2px solid var(--border);
    margin: 16px 0;
  }

  /* =========================================
     Slide Class Variants
     ========================================= */

  section.title {
    background: linear-gradient(145deg, #0A0A1A 0%, #1A0A3A 45%, #0D1A2E 100%);
    color: white;
    justify-content: flex-end;
    padding-bottom: 64px;
  }

  section.title::before {
    height: 6px;
    background: linear-gradient(90deg, #9945FF, #00C2FF, #14F195);
  }

  section.title h1 {
    color: white;
    font-size: 2.4em;
    letter-spacing: -0.03em;
    max-width: 86%;
    border-bottom: none;
    margin-bottom: 0;
    background: linear-gradient(90deg, #FFFFFF, #C8A8FF);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  section.title h2 {
    color: rgba(20, 241, 149, 0.8);
    font-size: 1.0em;
    font-weight: 400;
    border-bottom: none;
    margin-top: 12px;
  }

  section.title p {
    color: rgba(200, 168, 255, 0.6);
    font-size: 0.8em;
    margin-top: 28px;
  }

  section.section {
    background: linear-gradient(135deg, #13102A 0%, #1F0A45 60%, #0A1A2A 100%);
    color: white;
    justify-content: center;
  }

  section.section::before {
    background: linear-gradient(90deg, #9945FF, #00C2FF, #14F195);
    height: 6px;
  }

  section.section h2 {
    color: white;
    font-size: 2.0em;
    border-bottom: 2px solid rgba(153, 69, 255, 0.5);
    padding-bottom: 12px;
    background: linear-gradient(90deg, #9945FF, #14F195);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  section.section p {
    color: rgba(200, 168, 255, 0.85);
    font-size: 0.9em;
  }

  section.lead {
    justify-content: center;
    align-items: center;
    text-align: center;
  }

  section.lead h1 {
    font-size: 2.5em;
    border-bottom: none;
  }

  section.lead h2 {
    border-bottom: none;
    color: var(--muted);
    font-weight: 400;
  }

  section.dark {
    background: #080618;
    color: #C8BEFF;
  }

  section.dark h1 { color: white; }

  section.dark h2 {
    color: white;
    border-color: #9945FF;
  }

  section.dark code {
    background: rgba(153, 69, 255, 0.2);
    border-color: rgba(153, 69, 255, 0.4);
    color: #14F195;
  }

  section.dark td { border-color: #2A2550; }
  section.dark tr:nth-child(even) td { background: rgba(153, 69, 255, 0.07); }
  section.dark blockquote { background: rgba(20, 241, 149, 0.06); }

  section.ending {
    background: linear-gradient(145deg, #0A0A1A 0%, #1A0A3A 55%, #051A30 100%);
    color: white;
    justify-content: center;
    align-items: center;
    text-align: center;
  }

  section.ending::before {
    height: 6px;
    background: linear-gradient(90deg, #9945FF, #00C2FF, #14F195);
  }

  section.ending h1 {
    color: white;
    font-size: 2.8em;
    border-bottom: none;
    margin-bottom: 12px;
    background: linear-gradient(90deg, #9945FF, #00C2FF, #14F195);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  section.ending h2 {
    color: rgba(200, 168, 255, 0.75);
    border-bottom: none;
    font-weight: 400;
    font-size: 1.0em;
  }

  section.ending p {
    color: rgba(20, 241, 149, 0.6);
    font-size: 0.82em;
    margin-top: 20px;
  }

  /* =========================================
     Layout Components
     ========================================= */

  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 36px;
    align-items: start;
  }

  .columns.col-3    { grid-template-columns: 1fr 1fr 1fr; gap: 24px; }
  .columns.col-6-4  { grid-template-columns: 3fr 2fr; }
  .columns.col-4-6  { grid-template-columns: 2fr 3fr; }
  .columns.middle   { align-items: center; }

  .card {
    background: rgba(153, 69, 255, 0.08);
    border: 1px solid rgba(153, 69, 255, 0.25);
    border-radius: 10px;
    padding: 14px 18px;
    margin: 6px 0;
    color: #FFFFFF;
  }

  .card.accent  { border-left: 4px solid #9945FF; background: rgba(153, 69, 255, 0.1); }
  .card.warn    { border-left: 4px solid #14F195; background: rgba(20, 241, 149, 0.08); }
  .card.success { border-left: 4px solid #00C2FF; background: rgba(0, 194, 255, 0.07); }
  .card.danger  { border-left: 4px solid #FF6B6B; background: rgba(255, 107, 107, 0.07); }

  .highlight {
    background: linear-gradient(135deg, rgba(153, 69, 255, 0.15), rgba(20, 241, 149, 0.1));
    border: 1px solid rgba(153, 69, 255, 0.4);
    border-radius: 10px;
    padding: 14px 22px;
    font-size: 1.05em;
    font-weight: 600;
    text-align: center;
    margin: 10px 0;
    color: #FFFFFF;
  }

  .number {
    font-size: 2.8em;
    font-weight: 800;
    color: #9945FF;
    line-height: 1.0;
    display: block;
    letter-spacing: -0.03em;
  }

  .number.warm { color: #14F195; }

  .tag {
    display: inline-block;
    background: linear-gradient(90deg, #9945FF, #7B2FD4);
    color: white;
    font-size: 0.6em;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 999px;
    vertical-align: middle;
    letter-spacing: 0.03em;
    margin: 0 3px;
  }

  .tag.warm    { background: linear-gradient(90deg, #14F195, #0DB574); color: #0A0A1A; }
  .tag.success { background: linear-gradient(90deg, #00C2FF, #0090CC); }
  .tag.danger  { background: #FF6B6B; }
  .tag.outline { background: none; border: 1.5px solid #9945FF; color: #C8A8FF; }

  .icons {
    display: flex;
    gap: 20px;
    justify-content: center;
    align-items: flex-start;
    margin: 16px 0;
  }

  .icon-item { text-align: center; flex: 1; }
  .icon-item .icon  { font-size: 2.2em; display: block; margin-bottom: 6px; }
  .icon-item .label { font-size: 0.75em; font-weight: 600; color: var(--muted); }

  .progress {
    height: 8px;
    background: rgba(153, 69, 255, 0.2);
    border-radius: 4px;
    overflow: hidden;
    margin: 6px 0 12px;
  }

  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #9945FF, #00C2FF, #14F195);
    border-radius: 4px;
  }

  .steps { counter-reset: step; }
  .step {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    margin: 10px 0;
    color: #FFFFFF;
  }
  .step::before {
    counter-increment: step;
    content: counter(step);
    background: linear-gradient(135deg, #9945FF, #6D28D9);
    color: white;
    font-weight: 700;
    font-size: 0.85em;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
    box-shadow: 0 0 10px rgba(153, 69, 255, 0.5);
  }
---

<!-- _class: title -->
<!-- _paginate: false -->

# Solana × x402 × AWS でつくる<br>Super AI Payment Gateway

## HTTP 402 プロトコルで変わるマイクロペイメントの世界

2026-04 · mashharuki

---

![bg](./imgs/me.jpg)

---

## アジェンダ

<div class="columns">
<div>

1. **x402 とは何か**
   — 402 の歴史と現在
   — ペイメントフローの概要

2. **AWS 実装例 — Layer 1**
   — CloudFront + Lambda@Edge
   — コード変更ゼロでどんなAPIにも適用

3. **AWS 実装例 — Layer 2**
   — AgentCore + Strands Agent
   — AIエージェントが自律的に支払う

</div>
<div>

4. **作ってみてわかったこと**
   — 難易度・秘密鍵管理

5. **MPP / Tempo との関係性**
   — 競合？それとも補完関係？

6. **まとめ**

</div>
</div>

---

<!-- _class: section -->

## 01　x402 とは

HTTP ステータスコード 402 の「本来の夢」を実現する

---

## HTTP 402 — 30年前に予約されたステータスコード

<div class="columns middle">
<div>

- HTTP/1.0 策定時に **「決済用途」** として予約
- 30年以上 *未使用のまま放置*
- Coinbase が 2025年に **発表** → x402 誕生

<div class="highlight">
💡 アカウント不要・APIキー不要<br>暗号学的ペイメントプルーフだけで<br>コンテンツを有料化
</div>

</div>
<div>

```
HTTP/2 402 Payment Required
X-Payment-Response: {
  "accepts": [{
    "price": "$0.001 USDC",
    "network": "base-sepolia",
    "payTo":  "0xYourAddress"
  }]
}
```

> サーバーが「払え」と言う。
> クライアントが払ったら通す。
> それだけ。

</div>
</div>

---

## x402 ペイメントフロー

<div class="steps">
<div class="step">支払いなしでリクエスト → サーバーが402と支払い要件（価格・ネットワーク・宛先）を返す</div>
<div class="step">クライアントが支払い → ファシリテーター（x402.org）経由で USDC を送金しトークン取得</div>
<div class="step">トークン付きで再リクエスト → `X-Payment-Token` ヘッダーにセット</div>
<div class="step">サーバーがトークン検証 → ファシリテーターに問い合わせて正当性確認</div>
<div class="step">コンテンツ返却 + 決済確定 → オリジン成功時のみ課金を確定</div>
</div>

<div class="highlight">
オリジンがエラーを返した場合は課金されない — ユーザーフレンドリーな設計
</div>

---

<!-- _class: section -->

## 02　AWS 実装例 — Layer 1

CloudFront + Lambda@Edge でエッジ課金ゲートウェイ

---

## Layer 1 — x402 エッジゲートウェイ構成

<div class="columns col-5-5">
<div>

```
Client
  ↓
Amazon CloudFront
  ↓
Lambda@Edge (origin-request)
  │  X-Payment-Token を検証
  │  なければ 402 を即返却
  ↓
API Gateway → Lambda (Origin)
  ↓
Lambda@Edge (origin-response)
   成功時のみ課金確定
```

</div>
<div>

<div class="card accent">

### なぜエッジで検証？

**レイテンシ** — 未払いはオリジンに届かない

**スケール** — CloudFront のグローバルPoP

**改ざん防止** — オリジンに到達前に遮断

</div>

<div class="card success" style="margin-top:12px">

### 最大の強み

**オリジン側コード変更ゼロ**で既存APIを有料化

</div>

</div>
</div>

---

## Layer 1 — 機能一覧

<table style="width:100%; border-collapse:collapse; font-size:0.88em;">
<thead><tr>
<th style="background:linear-gradient(90deg,#9945FF,#6D28D9); color:#fff; padding:8px 14px; text-align:left;">エンドポイント</th>
<th style="background:linear-gradient(90deg,#9945FF,#6D28D9); color:#fff; padding:8px 14px; text-align:left;">価格</th>
<th style="background:linear-gradient(90deg,#9945FF,#6D28D9); color:#fff; padding:8px 14px; text-align:left;">説明</th>
</tr></thead>
<tbody>
<tr><td style="color:#fff; padding:7px 14px; border-bottom:1px solid #2A2550;"><code style="color:#14F195; background:rgba(153,69,255,0.15); border:1px solid rgba(153,69,255,0.4); border-radius:4px; padding:1px 5px;">GET /</code></td><td style="color:#14F195; font-weight:600; padding:7px 14px; border-bottom:1px solid #2A2550;">無料</td><td style="color:#fff; padding:7px 14px; border-bottom:1px solid #2A2550;">ウェルカムページ（支払い不要）</td></tr>
<tr style="background:rgba(153,69,255,0.07)"><td style="color:#fff; padding:7px 14px; border-bottom:1px solid #2A2550;"><code style="color:#14F195; background:rgba(153,69,255,0.15); border:1px solid rgba(153,69,255,0.4); border-radius:4px; padding:1px 5px;">GET /api/hello</code></td><td style="color:#D4AAFF; font-weight:700; padding:7px 14px; border-bottom:1px solid #2A2550;">$0.001 USDC</td><td style="color:#fff; padding:7px 14px; border-bottom:1px solid #2A2550;">ハローエンドポイント</td></tr>
<tr><td style="color:#fff; padding:7px 14px; border-bottom:1px solid #2A2550;"><code style="color:#14F195; background:rgba(153,69,255,0.15); border:1px solid rgba(153,69,255,0.4); border-radius:4px; padding:1px 5px;">GET /api/premium/data</code></td><td style="color:#D4AAFF; font-weight:700; padding:7px 14px; border-bottom:1px solid #2A2550;">$0.010 USDC</td><td style="color:#fff; padding:7px 14px; border-bottom:1px solid #2A2550;">プレミアムデータ</td></tr>
<tr style="background:rgba(153,69,255,0.07)"><td style="color:#fff; padding:7px 14px;"><code style="color:#14F195; background:rgba(153,69,255,0.15); border:1px solid rgba(153,69,255,0.4); border-radius:4px; padding:1px 5px;">GET /content/article</code></td><td style="color:#D4AAFF; font-weight:700; padding:7px 14px;">$0.005 USDC</td><td style="color:#fff; padding:7px 14px;">プレミアム記事</td></tr>
</tbody>
</table>

<br>

<div class="columns col-3">
<div class="card accent">

### テストネット対応
Solana Devnet / <br/>Base Sepoliaで開発・検証

</div>
<div class="card warn">

### IaC 管理

CDK でインフラをコード化

</div>
<div class="card success">

### 公式ドキュメント掲載
Coinbase x402 公式でも<br/>紹介された構成

</div>
</div>

---

<!-- _class: section -->

## 03　AWS 実装例 — Layer 2

AgentCore + Strands Agent で AI が自律的に支払う

---

## 全体アーキテクチャ

<div style="text-align:center; margin-top: -10px;">

![w:1000](./overview.png)

</div>

---

## AI Agent フロー — ユーザー体験

<div class="columns middle">
<div>

<div class="card accent">

**ユーザーが入力:**

「プレミアム分析データを取得して」

</div>

<div class="card" style="margin-top:16px">

**エージェントの内部処理:**
1. Bedrock で意図を解釈
2. MCP ツール `getPremiumData` を呼び出し
3. Payment Proxyが`402`を受け取り自動署名
4. 支払い済みトークンで再リクエスト
5. コンテンツ取得 → 応答生成

</div>

</div>
<div>

<div class="card success">

**エージェントの返答:**

「プレミアムデータを取得しました。
支払い: **$0.01 USDC**」

</div>

<div class="card warn" style="margin-top:16px">

### UIの支払い台帳
リアルタイムで決済履歴を記録

`tool: getPremiumData`
`payment: $0.01 USDC`

</div>

</div>
</div>

---

## CDK スタック構成 — 依存関係

<div class="columns col-6-4">
<div>

<table style="width:100%; border-collapse:collapse; font-size:0.85em;">
<thead><tr>
<th style="background:linear-gradient(90deg,#9945FF,#6D28D9); color:#fff; padding:8px 12px; text-align:left;">スタック</th>
<th style="background:linear-gradient(90deg,#9945FF,#6D28D9); color:#fff; padding:8px 12px; text-align:left;">役割</th>
</tr></thead>
<tbody>
<tr><td style="color:#fff; padding:7px 12px; border-bottom:1px solid #2A2550;"><code style="color:#14F195; background:rgba(153,69,255,0.15); border:1px solid rgba(153,69,255,0.4); border-radius:4px; padding:1px 5px;">SecretsStack</code></td><td style="color:#fff; padding:7px 12px; border-bottom:1px solid #2A2550;">EVM秘密鍵を Secrets Manager で管理</td></tr>
<tr style="background:rgba(153,69,255,0.07)"><td style="color:#fff; padding:7px 12px; border-bottom:1px solid #2A2550;"><code style="color:#14F195; background:rgba(153,69,255,0.15); border:1px solid rgba(153,69,255,0.4); border-radius:4px; padding:1px 5px;">CdkStack</code></td><td style="color:#fff; padding:7px 12px; border-bottom:1px solid #2A2550;">CloudFront + Lambda@Edge</td></tr>
<tr><td style="color:#fff; padding:7px 12px; border-bottom:1px solid #2A2550;"><code style="color:#14F195; background:rgba(153,69,255,0.15); border:1px solid rgba(153,69,255,0.4); border-radius:4px; padding:1px 5px;">PaymentProxyStack</code></td><td style="color:#fff; padding:7px 12px; border-bottom:1px solid #2A2550;">x402 自動支払いプロキシ</td></tr>
<tr style="background:rgba(153,69,255,0.07)"><td style="color:#fff; padding:7px 12px; border-bottom:1px solid #2A2550;"><code style="color:#14F195; background:rgba(153,69,255,0.15); border:1px solid rgba(153,69,255,0.4); border-radius:4px; padding:1px 5px;">AgentCoreGatewayStack</code></td><td style="color:#fff; padding:7px 12px; border-bottom:1px solid #2A2550;">MCP サーバー</td></tr>
<tr><td style="color:#fff; padding:7px 12px; border-bottom:1px solid #2A2550;"><code style="color:#14F195; background:rgba(153,69,255,0.15); border:1px solid rgba(153,69,255,0.4); border-radius:4px; padding:1px 5px;">StrandsAgentStack</code></td><td style="color:#fff; padding:7px 12px; border-bottom:1px solid #2A2550;">AI エージェント本体</td></tr>
<tr style="background:rgba(153,69,255,0.07)"><td style="color:#fff; padding:7px 12px;"><code style="color:#14F195; background:rgba(153,69,255,0.15); border:1px solid rgba(153,69,255,0.4); border-radius:4px; padding:1px 5px;">FrontendStack</code></td><td style="color:#fff; padding:7px 12px;">React UI の CloudFront + S3</td></tr>
</tbody>
</table>

</div>
<div>

```
SecretsStack
    ↓
CdkStack ────→ PaymentProxyStack
                    ↓
             AgentCoreGatewayStack
                    ↓
              StrandsAgentStack
                    ↓
               FrontendStack
```

> 全スタックを **IaC** で管理
> `bunx cdk deploy --all`
> で一発デプロイ

</div>
</div>

---

<!-- _class: section -->

## 04　作ってみてわかったこと

実装して初めてわかった3つの知見

---

## 知見 1 — 思ったより難しくない

<div class="columns">
<div>

### x402 導入のハードル

- `@x402/fetch` ライブラリで **数行追加するだけ**
- 既存 API のコード変更 **ゼロ** 
  （Lambda@Edge でラップ）
- ファシリテーター（x402.org）が検証を代行

</div>
<div>

### これが示すこと

<div class="card success">

**参入障壁が低い** = 実装者が今後急増

</div>

<div class="card accent" style="margin-top:12px">

MPP / Tempo 等の登場で
**マルチレイヤーでx402採用** が加速すると予想

</div>

<div class="card warn" style="margin-top:12px">

「誰でも使える = アイディアが差別化になる」

</div>

</div>
</div>

---

## 知見 2 — 秘密鍵管理は普遍の課題

<div class="columns">
<div>

### 今回の対策
**AWS Secrets Manager** に EVM 秘密鍵を格納
- Payment Proxy Lambda が初回のみフェッチ
- IAM ロールベースのアクセス制御

### 他の選択肢

<table style="width:100%; border-collapse:collapse; font-size:0.85em; margin-top:8px;">
<thead><tr>
<th style="background:linear-gradient(90deg,#9945FF,#6D28D9); color:#fff; padding:7px 12px; text-align:left;">手法</th>
<th style="background:linear-gradient(90deg,#9945FF,#6D28D9); color:#fff; padding:7px 12px; text-align:left;">特徴</th>
</tr></thead>
<tbody>
<tr><td style="color:#D4AAFF; font-weight:700; padding:7px 12px; border-bottom:1px solid #2A2550;">Secrets Manager</td><td style="color:#fff; padding:7px 12px; border-bottom:1px solid #2A2550;">シンプル・コスト低</td></tr>
<tr style="background:rgba(153,69,255,0.07)"><td style="color:#D4AAFF; font-weight:700; padding:7px 12px; border-bottom:1px solid #2A2550;">KMS</td><td style="color:#fff; padding:7px 12px; border-bottom:1px solid #2A2550;">鍵材料をAWSが管理</td></tr>
<tr><td style="color:#D4AAFF; font-weight:700; padding:7px 12px;">Nitro Enclaves</td><td style="color:#fff; padding:7px 12px;">KMS非対応アルゴリズムも対応</td></tr>
</tbody>
</table>

</div>
<div>

<div class="card danger">

### 本質的な課題

**「エージェントが自律的に支払う」= <br/>エージェントが秘密鍵を保持**

これは Web2 でいえばパスワードを
アプリに持たせるのと同じ問題

</div>

<div class="card accent" style="margin-top:14px">

### 今後の方向性
MPC / AA（Account Abstraction）との
組み合わせが鍵になりそう

</div>

</div>
</div>

---

<!-- _class: section -->

## 05　MPP / Tempo との関係性

競合ではなく補完

---

## x402 × MPP × Tempo の位置づけ

<div class="columns col-3">
<div class="card accent">

### x402
**HTTPレイヤーの<br/>決済プロトコル**

- 払ったら通すという仕組み
- オープン仕様
- エッジ・AIエージェント・MCPなど様々なレイヤーで採用可能

</div>
<div class="card warn">

### MPP
**マルチパーティペイメント**

- 複数の支払い経路・条件を抽象化
- x402 をトランスポートとして利用できる
- より複雑なビジネスロジックを実現

</div>
<div class="card success">

### Tempo
**決済スケジューリング<br/> & フロー**

- 定期課金・サブスクモデル
- x402 の「1リクエスト<br/>1決済」を補完
- ストリーミング決済も

</div>
</div>

<div class="highlight">
💡 x402 が「土台」、MPP/Tempo が「上物」— 潰し合いではなく積み上げる関係
</div>

---

## まとめ

<div>

### 今日のポイント

- **x402** = HTTP 402 を使った実用的なマイクロペイメント標準
- **CloudFront + Lambda@Edge** でオリジン無改修の課金ゲートウェイが作れる
- **AgentCore + Strands Agent** でAIが自律的に支払いながらAPIを叩ける
- **秘密鍵管理**は相変わらず難しいが、AWSなどsの各サービスで対処可能
- **MPP / Tempo** とは補完関係 — 採用レイヤーが今後拡大する

</div>


---

<!-- _class: ending -->
<!-- _paginate: false -->

# Thank you！

## mashharuki · X: @haruki_web3

気になった方はぜひリポジトリを ⭐ してください

`github.com/mashharuki/x402-Cloudfront-LambdaEdge-Sample`
