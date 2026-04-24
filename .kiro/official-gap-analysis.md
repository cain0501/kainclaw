# KainClaw vs 瀹樻柟 Claude Code 鑳藉姏瀵硅处

## Current Override - 2026-04-25

- This round validated:
  - `npm test`
  - `npm run check`
  - `npm run build`
- Current verified baseline after this round:
  - `144` test files
  - `938` tests passed
- `npm run build:electron` was not rerun in this round by the agent. Electron verification remains user-run.
- Electron shell parity moved forward one step:
  - `/todo`
  - `/compact`
  - `/review`
  - `/verify`
  are no longer desktop-shell hard blocks.
- This is still shell wiring work, not a new capability family. The value is that the Electron validation shell now reuses existing `src/` task / compact / inspection host paths instead of rejecting these commands up front.
- Electron workspace selection now has a parity-hardening layer for git-backed inspection:
  - the selected workspace remains the user-chosen folder and is no longer globally rewritten to a repo root
  - `/review` and `/verify` resolve git context separately, so a parent workspace with one nested repo can still yield the correct local diff
  - when no unique repo can be identified, `/review` and `/verify` warn that they are running without reliable local git diff context
- Follow-up hardening closed two Electron shell regressions:
  - inspection commands now resolve provider/runtime/MCP tool context against the inspection repo root from the start of the command path, not only inside the final review/verify handler
  - Electron IPC workspace updates can now clear the workspace back to `unset` instead of silently ignoring empty selections
- Electron workspace parity also moved forward at the UI/runtime boundary:
  - the shell now keeps normal auto-descend mostly silent instead of always expanding a diagnostic workspace card
  - only exceptional workspace states stay expanded in the UI, such as non-git degradation, missing paths, or multiple candidate repos
  - when multiple nested repos are found, the shell still exposes candidate repo buttons instead of leaving the user to re-guess the correct path manually
  - normal chat/runtime and Local Bridge flows now stay attached to the selected workspace path instead of inheriting git-only repo resolution
- Electron slash-command routing now runs before image-intent routing, so command inputs are no longer misclassified as image-edit prompts when recent image context exists.
- Review / verification output policy moved one step closer to expected product behavior: by default the body follows the user's language, and Chinese users should now receive Simplified Chinese explanatory text while `/verify` keeps the required English structural labels.

鏇存柊鏃堕棿锛?026-04-24

## 浣跨敤瑙勫垯

- 鏈枃浠跺彧鎵挎媴涓€浠朵簨锛氳褰曗€滃綋鍓嶄唬鐮佺姸鎬佲€濅笌鈥滃畼鏂?Claude Code 鐩爣鑳藉姏鈥濈殑瀵硅处缁撴灉銆?- 鍙淮鎶ょ姸鎬併€佽瘉鎹€佺己鍙ｅ拰闃舵浼樺厛绾э紝涓嶅啀杩藉姞娴佹按璐﹀紡鍙樻洿鍘嗗彶銆?- 浠讳綍鎵╁睍鑳藉姏閮藉繀椤绘槑纭爣娉ㄤ负鎵╁睍锛屼笉寰楄鐩栧畼鏂?parity 涓荤嚎銆?- 缁熶竴浠?UTF-8 without BOM 淇濆瓨銆?
鐘舵€佸畾涔夛細

- `宸插疄鐜癭锛氬綋鍓嶉」鐩唴宸叉湁鍙敤瀹炵幇锛屽彲浣滀负鐪熷疄鑳藉姏鐧昏銆?- `閮ㄥ垎瀹炵幇`锛氬凡鏈夐鏋舵垨瀛愰泦锛屼絾璺濈鐩爣浠嶆湁鏄庢樉宸窛銆?- `鏈疄鐜癭锛氬綋鍓嶆病鏈夊搴斿疄鐜般€?- `鏄庣‘涓嶅仛`锛氬綋鍓嶉樁娈垫槑纭帓闄わ紝涓嶈繘鍏ヨ繎鏈熷璐﹁寖鍥淬€?
## 褰撳墠鎬讳綋鍒ゆ柇

- 褰撳墠椤圭洰宸茬粡鏄竴涓彲鐢ㄧ殑鏈湴 AI 鍔╂墜楠岃瘉澹筹紝浣嗚繕涓嶆槸鏈€缁堜氦浠樺舰鎬併€?- `vscode-extension/` 浠嶆槸鏈湴楠岃瘉澹筹紱鏈€缁堜氦浠樼洰鏍囦粛鐒舵槸 Windows 绋嬪簭銆?- 褰撳墠鍙墦鍖呫€佸彲楠岃瘉鐨勬槸 Electron 鍐呮祴澹筹紝涓嶆槸瀹屾暣鍔熻兘 Windows 姝ｅ紡瀹㈡埛绔€?- 褰撳墠涓荤嚎浠嶇劧鏄€滃畼鏂?Claude Code 鑳藉姏瀵归綈浼樺厛锛孋ain 鎵╁睍鑳藉姏绗簩鈥濄€?- 鏍稿績鑳藉姏蹇呴』缁х画浼樺厛钀藉湪 `src/` runtime / service / adapter锛汦lectron 鍙仛妗岄潰澹炽€佹潈闄愩€両PC銆乁I銆?- 鍥惧儚銆丱ffice銆丩ocal Bridge銆乁ser Modeling銆丄uto Skill Generation 閮芥槸閲嶈鎵╁睍闈紝浣嗕笉鑳藉湪鏂囨。鍙欎簨閲屽弽瀹负涓汇€?- 褰撳墠楠岃瘉鍩虹嚎鐧昏锛?  - `137` 涓祴璇曟枃浠?  - `891` 涓祴璇曢€氳繃
  - 閫氳繃鍛戒护锛歚npm test`銆乣npm run check`銆乣npm run build`銆乣npm run build:electron`

## 鑳藉姏鐭╅樀

### 瀹樻柟瀵归綈涓荤嚎

| 鑳藉姏 | 褰撳墠鐘舵€?| 浠ｇ爜璇佹嵁 | 褰撳墠缂哄彛 |
| --- | --- | --- | --- |
| Provider 涓婚摼 | 宸插疄鐜?| `src/agent/providers/anthropicAdapter.ts` `src/agent/providers/openAIAdapter.ts` `src/agent/providers/claudeCliAdapter.ts` | 鏇村箍鐨?provider 鐢熸€佷笌鏇存繁鍗忚鍏煎浠嶅彲缁х画琛ラ綈 |
| 浼氳瘽鎸佷箙鍖?/ 瀵煎嚭 / 鎭㈠ | 宸插疄鐜?| `src/storage/sessionRepository.ts` `src/sessionListHost.ts` `src/savedSessionHost.ts` | 浼氳瘽绠＄悊 UI 浠嶅彲缁х画鎵撶（ |
| MCP runtime | 宸插疄鐜?| `src/mcpRuntime.ts` `src/mcpRuntime.helpers.ts` | OAuth / PKCE / prompts / templates parity 鏈畬鎴?|
| 鏂囦欢宸ュ叿 / 鍛戒护宸ュ叿 / 娴忚鍣ㄥ伐鍏?| 宸插疄鐜?| `src/toolRuntime.ts` `src/browserRuntime.ts` | Browser automation parity 浠嶆湭瀹屾暣瀵归綈 |
| Tasks / background command | 閮ㄥ垎瀹炵幇 | `src/tasks/taskRuntime.ts` `src/backgroundTaskHost.ts` `src/backgroundCommandWorker.ts` | remote / detached background task parity 鏈敹灏?|
| built-in Review | 閮ㄥ垎瀹炵幇 | `src/review/runner.ts` `src/agent/built-in/reviewAgent.ts` | ultrareview銆佽繙绔?review 鐢熷懡鍛ㄦ湡浠嶆湭瀹屽杽 |
| built-in Verification | 閮ㄥ垎瀹炵幇 | `src/verification/runner.ts` `src/agent/built-in/verificationAgent.ts` | hosted / detached verification parity 鏈畬鎴?|
| Plan Mode | 閮ㄥ垎瀹炵幇 | `src/planMode/planMode.ts` `src/planModeHost.ts` `src/planMode/planModePrompt.ts` | 鏇村畬鏁寸殑瀹樻柟 plan workflow 浠嶇己 |
| Thinking / Effort / Fast mode | 閮ㄥ垎瀹炵幇 | `src/thinkingEffort/effort.ts` `src/thinkingEffort/thinking.ts` `src/thinkingEffort/fastMode.ts` | 鏇存繁 phase 2 parity 浠嶆湭瀹屾垚 |
| Compact / Auto-compact | 閮ㄥ垎瀹炵幇 | `src/compact/compact.ts` `src/compact/autoCompact.ts` `src/compactHost.ts` | transcript / token lifecycle 鏇存繁瀵归綈浠嶆湭瀹屾垚 |
| Auto-Memory | 閮ㄥ垎瀹炵幇 | `src/autoMemory/paths.ts` `src/autoMemory/extractor.ts` `src/autoMemoryHost.ts` | memory orchestration 鏇存繁瀵归綈浠嶆湭瀹屾垚 |
| LSP | 閮ㄥ垎瀹炵幇 | `src/lsp/lspRuntime.ts` `src/lsp/formatters.ts` `src/lsp/types.ts` | server-manager / provider-availability parity 鏈畬鎴?|
| Worktree | 閮ㄥ垎瀹炵幇 | `src/worktree/runtime.ts` `src/worktree/types.ts` | 瀹屾暣 worktree 浜у搧娴佹湭瀹屾垚 |
| Hooks 鎵ц閾?| 閮ㄥ垎瀹炵幇 | `src/hooks/hooksExecutor.ts` `src/hooks/hooksTrigger.ts` `src/hooksRegistry.ts` | 瑙﹀彂鐐规帴绾垮拰浜у搧闈粛鏈畬鍏ㄦ帴榻?|
| Custom Agents | 閮ㄥ垎瀹炵幇 | `src/customAgentsRegistry.ts` `src/promptCommandHost.ts` | wizard銆佸畬鏁存墽琛岄潰銆佹闈?UI 浠嶆湭瀹屾垚 |
| Skills registry | 閮ㄥ垎瀹炵幇 | `src/skillsRegistry.ts` `src/customSkillsRegistry.ts` `src/promptCommandHost.ts` | 璺濈瀹樻柟瀹屾暣 Skills 浣撶郴浠嶆湁宸窛 |
| Slash commands 浣撶郴 | 閮ㄥ垎瀹炵幇 | `src/promptCommandHost.ts` `src/extension.ts` | 褰撳墠宸叉敞鍐?`/commands /agents /skills /hooks /add-dir /files /plan /compact /mcp /memory /todo /tools /review /verify`锛屼絾瑕嗙洊鐜囦粛浣?|
| Voice mode | 鏈疄鐜?| 鏃?| 褰撳墠娌℃湁瀵瑰簲瀹炵幇 |
| Prompt suggestion | 鏈疄鐜?| 鏃?| 褰撳墠娌℃湁瀵瑰簲瀹炵幇 |
| Plugin / Skills 甯傚満 | 鏈疄鐜?| 鏃?| 褰撳墠娌℃湁瀵瑰簲瀹炵幇 |

### Cain 鎵╁睍涓庢闈㈣兘鍔?
| 鑳藉姏 | 褰撳墠鐘舵€?| 浠ｇ爜璇佹嵁 | 褰撳墠缂哄彛 |
| --- | --- | --- | --- |
| Electron 妗岄潰楠岃瘉澹?| 宸插疄鐜?| `electron/main.ts` `electron/preload.ts` `electron/ElectronChatPanel.ts` `electron/renderer/index.html` | 褰撳墠鏄唴娴嬪３锛屼笉鏄畬鏁?Windows 姝ｅ紡瀹㈡埛绔?|
| Auto Skill Generation | 宸插疄鐜?| `src/skills/skillStore.ts` `src/skills/skillDistiller.ts` `src/backgroundTaskHost.ts` | 浜у搧闈㈠拰娌荤悊闈粛鍙户缁敹鍙?|
| User Modeling | 宸插疄鐜?| `src/userModel/profileStore.ts` `src/userModel/profileDistiller.ts` | UI 绠＄悊闈粛鏈畬鏁?|
| 鍥惧儚鑱婂ぉ宸ヤ綔娴?| 宸插疄鐜?| `src/imageGeneration/imageWorkflowOrchestrator.ts` `electron/ElectronChatPanel.ts` `electron/renderer/index.html` | 褰撳墠宸茬Щ鍒拌亰澶╀富閾撅紝浣嗕粛鏄墿灞曢潰锛屼笉鏄富鏍稿績 |
| 鍥惧儚妯″瀷閰嶇疆 | 宸插疄鐜?| `src/storage/settingsRepository.ts` `src/imageGeneration/openAIImageClient.ts` `electron/renderer/index.html` | UI 浠嶅彲缁х画鏀跺彛 |
| Prompt Library | 宸插疄鐜?| `src/imageGeneration/promptLibraryRepository.ts` `src/imageGeneration/promptLibraryBuiltins.ts` | 鍚庣画鍙户缁仛璧勪骇娌荤悊涓庡睍绀轰綋楠?|
| 鍙傝€冨浘鎼滅储 | 閮ㄥ垎瀹炵幇 | `src/imageGeneration/imageMaterialSearch.ts` `src/imageGeneration/imageWorkflowOrchestrator.ts` | 褰撳墠鏄€滀袱娈靛紡浠诲姟鍑嗗 + 鐧惧害鍥剧墖鎶撳彇鈥濈殑杩囨浮閾撅紝闀挎湡鐩爣浠嶆槸缃戦〉璧勬枡鎼滅储鍚庢娊瑙嗚绾跨储/鍙敤鍥剧墖 |
| 鍥惧儚缁撴灉鏈湴鍖栨寔涔呭寲 | 宸插疄鐜?| `src/imageGeneration/imageLabGalleryStore.ts` `electron/ElectronChatPanel.ts` | 缂撳瓨涓庢竻鐞嗙瓥鐣ヤ粛鍙户缁紭鍖?|
| DesktopRuntimeServices 娉ㄥ叆灞?| 閮ㄥ垎瀹炵幇 | `src/platform/desktopRuntimeServices.ts` `electron/main.ts` | 褰撳墠 Electron 鐪熸鎺ヤ笂鐨勫彧鏈?`localBridgeRuntime` |
| Local Bridge runtime | 宸插疄鐜?| `src/localBridge/localBridgeRuntime.ts` `src/localBridge/localBridgeProxy.ts` `src/localBridge/localBridgeSession.ts` | 鏈€灏忛棴鐜凡钀藉湴锛屽畬鏁?token 鐢熷懡鍛ㄦ湡涓庢洿骞夸笟鍔￠潰鏈畬鎴?|
| Word Add-in 鏈€灏忛摼璺?| 閮ㄥ垎瀹炵幇 | `office-addin/word/manifest.xml` `src/officeBridge/bridgeClient.ts` `src/officeBridge/wordQuestionAnswer.ts` | 褰撳墠鍙埌鍙闂瓟 / 閫夊尯涓婁笅鏂?/ citation 鍛戒腑锛屽畬鏁?Office 涓氬姟閾炬湭瀹屾垚 |
| Browser Bridge runtime | 鏈疄鐜?| `src/platform/browserBridgeRuntime.ts` | 褰撳墠鍙湁鎺ュ彛锛屾病鏈変富娴佺▼瀹炵幇 |
| Desktop automation / Computer Use | 鏈疄鐜?| `src/platform/desktopAutomationRuntime.ts` | 褰撳墠鍙湁鎺ュ彛锛屾病鏈変富娴佺▼瀹炵幇 |
| Scheduler / Cron runtime | 鏈疄鐜?| `src/platform/schedulerRuntime.ts` | 褰撳墠鍙湁鎺ュ彛锛屾病鏈変富娴佺▼瀹炵幇 |
| 浼佷笟 MDM / managed settings | 鏄庣‘涓嶅仛 | 鏃?| 褰撳墠闃舵鏄庣‘鎺掗櫎 |

## 褰撳墠浠ｇ爜鐘舵€佺殑琛ュ厖璇存槑

### 宸茬粡鏄庢樉绋冲畾涓嬫潵鐨勪富绾?
- 鏍稿績 AI/runtime 鑳藉姏宸茬粡绋冲畾瀛樺湪锛歅rovider銆佷細璇濇寔涔呭寲銆丮CP runtime銆佹枃浠?鍛戒护/娴忚鍣ㄥ伐鍏枫€乀asks/background command銆丷eview/Verification銆乀hinking/Effort/Fast銆丆ompact/Auto-Memory銆丩SP銆乄orktree銆丠ooks銆丆ustom Agents銆丼kills registry銆?- Electron 鐜板湪搴旇鍑嗙‘鎻忚堪涓衡€滃彲鎵撳寘銆佸彲楠岃瘉鐨勬闈㈠唴娴嬪３鈥濓紝鑰屼笉鏄畬鏁村鎴风銆?- 鍥惧儚涓婚摼宸茬粡浠庢棫 `Image Lab` 椤甸潰杩佸埌鑱婂ぉ娴侊紱鏃?`Image Lab` 鏇存帴杩戝簳灞傛壙杞藉３鍜屽巻鍙?UI锛岃€屼笉鏄骇鍝佷富鍏ュ彛銆?- Prompt Library 宸茬粡鍗囩骇涓?`src/` 鏁版嵁灞傞┍鍔紝涓嶅啀鍙槸 renderer 鍘熷瀷銆?- `Local Bridge` 宸茬粡浠庣函瑙勫垝杩涘叆鏈€灏忓彲杩愯瀹炵幇闃舵锛學ord Add-in 鍙 MVP 涓婚摼涔熷凡鏈夎惤鍦版枃浠朵笌浠ｇ爜璺緞銆?- 2026-04-15 鍒?2026-04-20 鐨勫畼鏂?parity 鏀跺熬涓荤嚎宸茬粡姣旇緝娓呮锛?  - `tasks / toolRuntime`
  - `verification`
  - `compact`
  - `lsp / worktree`
  - `extension.ts / handlePrompt` 瀹夸富鍑忓€?
### 褰撳墠鏈€澶у墿浣欓闄╁尯

- `src/extension.ts` 浠嶆槸楂橀闄╁涓诲叆鍙ｏ紝铏界劧宸茬粡鎶藉嚭澶ч噺 host/helper锛屼絾鎬绘帶閫昏緫浠嶅帤銆?- `electron/renderer/index.html` 涓?`electron/ElectronChatPanel.ts` 浠嶇劧鏄獙璇佸３灞傦紝涓嶅簲缁х画鍫嗘柊鐨勬牳蹇冧笟鍔￠€昏緫銆?- `DesktopRuntimeServices` 閲岀湡姝ｆ帴涓婄殑 runtime 浠嶇劧澶皯锛宍desktopAutomationRuntime / browserBridgeRuntime / schedulerRuntime` 杩樺仠鐣欏湪杈圭晫灞傘€?- 褰撳墠鈥滄壘鍙傝€冨浘鈥濊櫧鐒跺凡浠庡浗澶栧浘搴?API 鍒囪蛋锛屾敼涓烘洿绗﹀悎涓浗澶ч檰鐢ㄦ埛鐜鐨勬悳绱㈤摼锛屼絾浠嶆槸杩囨浮鎬侊紝涓嶆槸鏈€缁堝舰鎬併€?
## 褰撳墠浼樺厛椤哄簭锛圥hase 2 鏀跺熬锛?
1. `tasks / toolRuntime` 鏀跺熬
2. Verification Agent 鏀跺熬
3. Compact 鏀跺熬
4. LSP / Worktree 鏇存繁 parity
5. `src/extension.ts` 瀹夸富鍑忓€虹户缁笅娌夊埌 host / runtime / adapter

## Phase 3 鍔熻兘绉帇锛堝綋鍓?Phase 2 瀹屾垚鍚庡紑濮嬶級

### 绗竴姊槦锛氭牳蹇冩墿灞曟€ч鏋?
- 鏂滄潬鍛戒护浣撶郴鎵╁睍锛氬湪鐜版湁娉ㄥ唽琛ㄩ鏋朵笂缁х画琛ュ懡浠よ鐩栫巼銆?- Skills 鍐呯疆鎶€鑳戒綋绯伙細瀹屽杽 SkillTool銆佸唴缃?skill 娉ㄥ唽涓庢闈㈡墽琛岄潰銆?- Hooks 鑷姩鍖栨鏋讹細缁х画琛?toolRuntime / promptCommandHost / promptTurnHost 瑙﹀彂鐐广€?- Custom Agents锛氳ˉ wizard銆佹墽琛岄€氳矾銆佺鐞嗛潰銆?
### 绗簩姊槦锛氱敤鎴蜂綋楠屾彁鍗?
- Memory 绠＄悊 UI
- Context 绠＄悊 UI
- Prompt suggestion
- TodoWriteTool 鐨勫畬鏁翠骇鍝佹祦

### 绗笁姊槦锛氶珮绾ц兘鍔?
- Cron / Scheduler
- Voice mode
- WorkflowTool
- REPL Tool
- ToolSearchTool 娣卞寲

### 绗洓姊槦锛氬钩鍙扮骇鑳藉姏锛堥暱鏈燂級

- Plugin / Skills 甯傚満
- Advisor 鍙屾ā鍨嬮€氶亾
- 璇婃柇涓庝娇鐢ㄥ懡浠わ紙`/doctor`銆乣/usage`銆乣/cost`銆乣/stats` 绛夛級
- Notebook 缂栬緫
- Bridge / 杩滅▼鎺у埗

### 鏄庣‘涓嶅湪 Phase 3 鑼冨洿鍐?
- 浼佷笟 MDM / managed settings

## Phase 4 鍔熻兘绉帇锛圵indows 瀹㈡埛绔畬鎴愬悗寮€濮嬶級

### Office 鐢熸€侊紙Word / Excel / PowerPoint Add-in锛?
- Windows 瀹㈡埛绔?`Local Bridge` 瀹屾暣浜у搧鍖?- Word Add-in MVP 瀹屾暣闂幆
- KainClaw 璁剧疆闈㈤噷鐨?Office 瀹夎涓庣姸鎬佸叆鍙?- Word Add-in 瀹屾暣缂栬緫娴?- Excel Add-in
- PowerPoint Add-in
- 璺ㄥ簲鐢ㄤ笂涓嬫枃鍏变韩
- AI 瑙嗚璁捐鐢熸垚绛夐暱鏈熸帰绱㈠瀷鎵╁睍

## 鐩稿叧瑙勬牸涓庡弬鑰冭矾寰?
杩欎唤瀵硅处鏂囨。鍙洖绛斺€滅幇鍦ㄥ仛鍒板摢銆佽繕宸粈涔堚€濄€傚鏋滆缁х画鎺ㄨ繘鏌愪釜鑳藉姏锛岀洿鎺ヨ烦鍒板搴旇鏍硷細

### 涓昏鏍间笌鍙傝€?
- 涓讳骇鍝佽鏍硷細
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\v1-product-spec.md`
- 瀹樻柟婧愮爜鑳藉姏绱㈠紩锛?  - `E:\claudecodejingiang\vscode-extension\.kiro\source-reference.md`
- 鏂囨。鎭㈠鑽夌锛?  - `E:\claudecodejingiang\vscode-extension\.kiro\recovery-draft-2026-04-24.md`
  - 浠呯敤浜庢仮澶嶆棫涓讳綋鍜屽巻鍙茶〃杩帮紝涓嶄綔涓哄綋鍓嶇姸鎬佺湡婧愩€?
### Phase 3 / Phase 4 瀵瑰簲瑙勬牸

- Computer Use / Browser Bridge锛?  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\computer-use-browser-bridge.md`
- Office Add-in / Local Bridge锛?  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\office-addin-ecosystem.md`
- Hooks锛?  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\p3-hooks-execution-chain.md`
- Custom Agents锛?  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\p3-custom-agents-wizard.md`
- Cron / Scheduler锛?  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\p3-cron-scheduled-tasks.md`
- 璺ㄤ細璇濇悳绱細
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\x01-cross-session-search.md`
- User Modeling锛?  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\x02-user-modeling.md`
- Message Gateway锛?  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\x03-message-gateway.md`
- Companion锛?  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\f09-companion.md`
- Auto Skill Generation锛?  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\f11-auto-skill-generation.md`
- KainClaw Design锛?  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\kainclaw-design.md`
- Worker 鏉冮檺杈圭晫锛?  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\p05-worker-permissions.md`

## Latest Sync - 2026-04-24

- 褰撳墠鏂囨。涓讳綋鎭㈠鍒扳€滃畼鏂?parity 涓荤嚎浼樺厛鈥濈殑鍐欐硶锛屼笉鍐嶆妸鍥剧墖鑳藉姏璇啓鎴愰」鐩富鏍稿績銆?- 楠岃瘉鍩虹嚎鐧昏鏇存柊涓猴細`137` 涓祴璇曟枃浠躲€乣891` 涓祴璇曢€氳繃锛沗npm test`銆乣npm run check`銆乣npm run build`銆乣npm run build:electron` 涓哄綋鍓嶉€氳繃鍛戒护銆?- `Local Bridge` 宸蹭粠绾鍒掓敼鍐欎负鈥滄渶灏忓彲杩愯瀹炵幇宸茶惤鍦帮紝瀹屾暣涓氬姟閾炬湭瀹屾垚鈥濄€?- `Word Add-in` 宸蹭粠绾鍒掓敼鍐欎负鈥滃彧璇?MVP 涓婚摼鎺ㄨ繘涓€濄€?- 鍥惧儚閾捐矾宸叉槑纭褰曚负鑱婂ぉ涓婚摼鎵╁睍鑳藉姏锛屽寘鍚浘鍍忔ā鍨嬪閰嶇疆銆丳rompt Library 鏁版嵁灞傘€佺粨鏋滄湰鍦版寔涔呭寲銆佸弬鑰冨浘鎼滅储杩囨浮閾剧瓑褰撳墠浜嬪疄銆?
