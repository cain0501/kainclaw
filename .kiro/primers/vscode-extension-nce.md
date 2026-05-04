# Primer: vscode-extension-nce
## 首屏设计入口默认页改为 Design Home

### 背景

用户点击顶部导航「设计」按钮后，落地页不是 Design Home（项目列表），体验割裂。应该默认显示 Design Home。

### 排查路径

在 `electron/renderer/index.html` 里找 `showDesignPage()` 或 `openDesignHub()` 函数（约 line 2525-2557），以及顶部导航「设计」按钮的 click handler。

确认：
1. 点「设计」按钮触发了什么函数
2. 该函数是否直接进入了上次打开的项目，而跳过了 Design Home
3. 如果有 `lastOpenedDesignProjectId`，现在是否直接跳过 Home 打开了上次的项目

### 要做

逻辑应该是：
- 点「设计」→ 始终先显示 Design Home（项目列表）
- Design Home 上展示「最近打开」的项目，用户主动点击才进入编辑器
- 不要在进入设计模块时自动打开上次的项目

### 验收

```
1. 点顶部「设计」按钮 → 显示 Design Home（有项目列表）
2. 项目列表里点某个项目 → 进入编辑器
3. 退出再重进 → 仍然显示 Design Home，不自动打开上次项目
```

### 完成后

```bash
npm run build:electron
bd close vscode-extension-nce
git add <files> && git commit -m "Design: default landing to Design Home instead of last project"
git push
```
