
# Moodle-Assist

課題用



## Installation

プロジェクトフォルダで以下のコマンドを入力する

```bash
  npm install
```
    
プロジェクトフォルダ直下に.envファイルを作成し、以下のように記述する

```env
PORT=
DISCORD_WEBHOOK_URL=
```
PORT: ポート 3000とかでいい\
DISCORD_WEBHOOK_URL: チャンネルの設定→連携サービスから取得したURLをペースト (Optional)
## Usage

```bash
  npm start
```
何事も無ければhttps://localhost:3000 でリッスンされるはず おはようございます！
## Todo
- [x]  重複対策
- [x]  md作成
- [ ]  Github Pagesで仮公開（必要？）
- [ ]  bot送信時の特殊文字対策
- [ ]  レスポンシブ
- [ ]  Apple端末にウィジェットとして追加（出来るか分からん）