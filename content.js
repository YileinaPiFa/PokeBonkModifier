// ==UserScript==
// @name         PokéBonk 修改器
// @namespace    http://tampermonkey.net/
// @version      1.5.0
// @description  PokéBonk 局内全参数自定义修改器
// @author       Antigravity
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  if (window.__POKEBONK_TRAINER_INJECTED__) return;
  window.__POKEBONK_TRAINER_INJECTED__ = true;

  // ==================== 1. 鼠标锁定 (Pointer Lock) 智能拦截 ====================
  let isPanelOpen = false;

  // 当面板呼出时，阻止游戏自动抢回鼠标指针
  const origRequestPointerLock = Element.prototype.requestPointerLock;
  if (origRequestPointerLock) {
    Element.prototype.requestPointerLock = function (...args) {
      if (isPanelOpen) {
        return Promise.reject(new Error('Pointer lock blocked while trainer is active'));
      }
      return origRequestPointerLock.apply(this, args);
    };
  }

  function unlockMouse() {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  // ==================== 2. 全自动对局对象捕获机制 ====================
  let capturedRun = null;

  function isValidRun(r) {
    return Boolean(
      r &&
      typeof r === 'object' &&
      r !== window &&
      r.player &&
      typeof r.player === 'object' &&
      r.diff &&
      typeof r.diff === 'object' &&
      typeof r.player.level === 'number'
    );
  }

  function hookAppPrototype(proto) {
    if (!proto || proto.__POKEBONK_HOOKED__) return;
    proto.__POKEBONK_HOOKED__ = true;

    // 劫持 frameGap：游戏核心循环每一帧都会调用
    if (typeof proto.frameGap === 'function') {
      const origFrameGap = proto.frameGap;
      proto.frameGap = function () {
        if (this.run && isValidRun(this.run)) {
          capturedRun = this.run;
          window.__run = this.run;
        }
        return origFrameGap.apply(this, arguments);
      };
    }

    // 劫持 startRun
    if (typeof proto.startRun === 'function') {
      const origStartRun = proto.startRun;
      proto.startRun = function (...args) {
        const res = origStartRun.apply(this, args);
        if (this.run && isValidRun(this.run)) {
          capturedRun = this.run;
          window.__run = this.run;
        }
        return res;
      };
    }

    // 劫持 toMenu
    if (typeof proto.toMenu === 'function') {
      const origToMenu = proto.toMenu;
      proto.toMenu = function (...args) {
        capturedRun = null;
        window.__run = null;
        return origToMenu.apply(this, args);
      };
    }
  }

  async function autoHookGame() {
    const urls = new Set();
    if (typeof performance !== 'undefined' && performance.getEntriesByType) {
      for (const entry of performance.getEntriesByType('resource')) {
        if (entry.name && entry.name.includes('/assets/main-') && entry.name.endsWith('.js')) {
          urls.add(entry.name);
        }
      }
    }
    for (const s of document.querySelectorAll('script[src]')) {
      if (s.src && s.src.includes('main-') && s.src.endsWith('.js')) {
        urls.add(s.src);
      }
    }
    for (const url of urls) {
      try {
        const mod = await import(url);
        if (mod && mod.App && mod.App.prototype) {
          hookAppPrototype(mod.App.prototype);
          break;
        }
      } catch (e) {}
    }
  }

  setInterval(() => {
    if (!capturedRun) {
      autoHookGame();
    }
  }, 600);

  function getRun() {
    if (isValidRun(capturedRun)) return capturedRun;
    if (isValidRun(window.__run)) return window.__run;
    if (isValidRun(window.__PB?.run)) return window.__PB.run;
    if (isValidRun(window.temp1)) return window.temp1;
    if (isValidRun(window.run)) return window.run;
    return null;
  }

  // ==================== 3. 极简黑白 UI 界面 ====================
  function initUI() {
    if (document.getElementById('pokebonk-trainer-host')) return;

    const host = document.createElement('div');
    host.id = 'pokebonk-trainer-host';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        --bg-panel: #161616;
        --bg-card: #202020;
        --bg-input: #111111;
        --border-main: #333333;
        --border-light: #444444;
        --text-white: #ffffff;
        --text-light: #d6d6d6;
        --text-muted: #888888;
        --btn-bg: #2a2a2a;
        --btn-hover: #383838;
        --btn-active: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 12px;
        color: var(--text-light);
        z-index: 9999999;
        position: fixed;
      }

      /* 极简黑白面板 */
      .trainer-panel {
        position: fixed;
        top: 50px;
        right: 40px;
        width: 480px;
        max-height: 88vh;
        background: var(--bg-panel);
        border: 1px solid var(--border-main);
        border-radius: 6px;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.85);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 9999999;
      }
      .trainer-panel.hidden {
        display: none !important;
      }

      /* 标题栏 */
      .panel-header {
        padding: 10px 14px;
        background: #1c1c1c;
        border-bottom: 1px solid var(--border-main);
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: move;
        user-select: none;
      }
      .panel-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--text-white);
        display: flex;
        align-items: center;
        gap: 8px;
        letter-spacing: 0.5px;
      }
      .status-pill {
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 4px;
        font-weight: 500;
        border: 1px solid var(--border-light);
        background: #111111;
        color: #cccccc;
      }
      .status-connected {
        border-color: #555555;
        color: #ffffff;
        background: #252525;
      }
      .status-disconnected {
        color: #777777;
        border-color: #333333;
      }
      .panel-header-btn {
        background: #252525;
        border: 1px solid var(--border-light);
        color: #d0d0d0;
        cursor: pointer;
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 3px;
        display: flex;
        align-items: center;
        gap: 4px;
        transition: all 0.15s ease;
      }
      .panel-header-btn:hover {
        color: #ffffff;
        border-color: #777777;
        background: #333333;
      }
      .panel-bottom-bar {
        padding: 6px 12px;
        background: #181818;
        border-top: 1px solid var(--border-main);
      }
      .btn-reset-full {
        width: 100%;
        background: #242424;
        border: 1px solid #484848;
        color: #ffffff;
        font-weight: 600;
        font-size: 12px;
        padding: 6px 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .btn-reset-full:hover {
        background: #323232;
        border-color: #888888;
        color: #ffffff;
      }
      .close-btn {
        background: none;
        border: 1px solid transparent;
        color: var(--text-muted);
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        padding: 2px 6px;
        border-radius: 3px;
      }
      .close-btn:hover {
        color: #ffffff;
        border-color: var(--border-light);
        background: #262626;
      }

      /* 选项卡导航 */
      .nav-tabs {
        display: flex;
        background: #191919;
        border-bottom: 1px solid var(--border-main);
        padding: 4px 6px;
        gap: 4px;
      }
      .tab-btn {
        background: transparent;
        border: 1px solid transparent;
        color: var(--text-muted);
        padding: 5px 11px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.1s;
      }
      .tab-btn:hover {
        color: var(--text-white);
        background: #262626;
      }
      .tab-btn.active {
        color: #000000;
        background: #e5e5e5;
        border-color: #e5e5e5;
        font-weight: 700;
      }

      /* 面板主体内容 */
      .panel-body {
        padding: 12px 14px;
        overflow-y: auto;
        max-height: calc(88vh - 110px);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .panel-body::-webkit-scrollbar {
        width: 4px;
      }
      .panel-body::-webkit-scrollbar-thumb {
        background: #333333;
        border-radius: 2px;
      }

      .tab-content {
        display: none;
        flex-direction: column;
        gap: 10px;
      }
      .tab-content.active {
        display: flex;
      }

      /* 分组区块 */
      .card {
        background: var(--bg-card);
        border: 1px solid var(--border-main);
        border-radius: 4px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .card-title {
        font-size: 11px;
        font-weight: 700;
        color: #a0a0a0;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 1px solid #2d2d2d;
        padding-bottom: 4px;
      }

      /* 网格按钮 */
      .btn-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 6px;
      }
      .btn-grid-3 {
        grid-template-columns: repeat(3, 1fr);
      }

      /* 按钮样式 */
      .btn {
        background: var(--btn-bg);
        border: 1px solid var(--btn-border);
        color: #e2e2e2;
        padding: 6px 10px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: background 0.1s, border-color 0.1s;
        text-align: center;
        white-space: nowrap;
      }
      .btn:hover {
        background: var(--btn-hover);
        border-color: #666666;
        color: #ffffff;
      }
      .btn:active {
        background: #444444;
      }
      .btn-solid {
        background: #d4d4d4;
        border-color: #d4d4d4;
        color: #111111;
        font-weight: 700;
      }
      .btn-solid:hover {
        background: #ffffff;
        border-color: #ffffff;
        color: #000000;
      }

      /* 表单行 */
      .ctrl-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 12px;
      }
      .ctrl-row span {
        flex: 1;
        color: #b5b5b5;
      }
      .ctrl-input {
        width: 80px;
        background: var(--bg-input);
        border: 1px solid var(--border-main);
        border-radius: 3px;
        color: #ffffff;
        padding: 4px 6px;
        font-size: 12px;
        text-align: right;
      }
      .ctrl-input:focus {
        outline: none;
        border-color: #777777;
      }
      .ctrl-select {
        background: var(--bg-input);
        border: 1px solid var(--border-main);
        border-radius: 3px;
        color: #ffffff;
        padding: 4px 6px;
        font-size: 12px;
      }

      .input-btn-group {
        display: flex;
        align-items: center;
        gap: 5px;
      }

      /* Toast 消息 */
      .toast {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        background: #252525;
        border: 1px solid #555555;
        color: #ffffff;
        padding: 5px 12px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
        opacity: 0;
        transition: opacity 0.2s ease;
        white-space: nowrap;
        z-index: 1000;
      }
      .toast.show {
        opacity: 1;
      }

      .footer-note {
        font-size: 11px;
        color: var(--text-muted);
        text-align: center;
        padding: 6px 14px;
        border-top: 1px solid var(--border-main);
        background: #171717;
      }
    `;
    shadow.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="trainer-panel hidden" id="panel">
        <div class="panel-header" id="panelHeader">
          <div class="panel-title">
            <span>PokéBonk 修改器</span>
            <span class="status-pill status-disconnected" id="connStatus">自动侦测中...</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <button class="panel-header-btn" id="btnHeaderReset" title="一键重置所有参数并恢复游戏默认">恢复默认</button>
            <button class="close-btn" id="closeBtn" title="按 ~ 键关闭">×</button>
          </div>
        </div>

        <div class="nav-tabs">
          <button class="tab-btn active" data-tab="tab-resources">资源与数值</button>
          <button class="tab-btn" data-tab="tab-survival">生存与战斗</button>
          <button class="tab-btn" data-tab="tab-stats">角色属性</button>
          <button class="tab-btn" data-tab="tab-enemies">敌人调控</button>
          <button class="tab-btn" data-tab="tab-capture">闪光与捕获</button>
          <button class="tab-btn" data-tab="tab-world">环境与倍速</button>
        </div>

        <div class="panel-body">
          <!-- 1. 资源与数值 -->
          <div class="tab-content active" id="tab-resources">
            <div class="card">
              <div class="card-title">局内金币</div>
              <div class="ctrl-row">
                <span>设定金币数量</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpGoldVal" value="100" min="0" step="10">
                  <button class="btn btn-solid" id="btnSetGold">设为该值</button>
                  <button class="btn" id="btnAddGold">+追加</button>
                </div>
              </div>
              <div class="btn-grid-3 btn-grid" style="margin-top: 2px;">
                <button class="btn" id="btnQuickGold50">+50 金币</button>
                <button class="btn" id="btnQuickGold200">+200 金币</button>
                <button class="btn" id="btnQuickGold1000">+1000 金币</button>
              </div>
            </div>

            <div class="card">
              <div class="card-title">钥匙与刷新</div>
              <div class="ctrl-row">
                <span>钥匙数量 (keys)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpKeysVal" value="5" min="0" step="1">
                  <button class="btn" id="btnSetKeys">设定钥匙</button>
                </div>
              </div>
              <div class="ctrl-row">
                <span>选卡刷新次数 (rerolls)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpRerollsVal" value="5" min="0" step="1">
                  <button class="btn" id="btnSetRerolls">设定刷新</button>
                </div>
              </div>
              <div class="ctrl-row">
                <span>选卡跳过/放逐 (skips)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpSkipsVal" value="5" min="0" step="1">
                  <button class="btn" id="btnSetSkips">设定次数</button>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-title">等级与经验</div>
              <div class="ctrl-row">
                <span>增加对局经验</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpAddXpVal" value="500" min="10" step="100">
                  <button class="btn btn-solid" id="btnApplyAddXp">+增加经验</button>
                </div>
              </div>
              <div class="ctrl-row">
                <span>经验获取倍率 (xpMult)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpXpMultVal" value="2.0" min="1" step="0.5">
                  <button class="btn" id="btnSetXpMult">设定倍率</button>
                </div>
              </div>
              <div class="btn-grid" style="margin-top: 2px;">
                <button class="btn" id="btnGainLevel">直接升 1 级 (选卡)</button>
                <button class="btn" id="btnXpNext1">下级所需经验设为 1</button>
                <button class="btn" id="btnMoveSlots">招式栏位开到 4</button>
                <button class="btn" id="btnVitaminSlots">维生素栏位开到 8</button>
              </div>
            </div>
          </div>

          <!-- 2. 生存与战斗 -->
          <div class="tab-content" id="tab-survival">
            <div class="card">
              <div class="card-title">保命功能</div>
              <div class="btn-grid">
                <button class="btn btn-solid" id="btnGodMode">无敌模式 (GodMode 开关)</button>
                <button class="btn" id="btnFullHeal">回满生命值</button>
              </div>
              <div class="ctrl-row" style="margin-top: 2px;">
                <span>无敌帧持续时间 (秒)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpIframesVal" value="10" min="1" step="5">
                  <button class="btn" id="btnSetIframes">设置</button>
                </div>
              </div>
              <div class="ctrl-row">
                <span>隐身持续时间 (秒)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpInvisVal" value="15" min="1" step="5">
                  <button class="btn" id="btnSetInvis">设置</button>
                </div>
              </div>
              <div class="ctrl-row">
                <span>复活次数 (revives)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpRevivesVal" value="3" min="0" step="1">
                  <button class="btn" id="btnSetRevives">设置</button>
                </div>
              </div>
              <div class="btn-grid" style="margin-top: 2px;">
                <button class="btn" id="btnReviveDead">原地复活</button>
                <button class="btn btn-solid" id="btnUltReady">终极技立即就绪 (Ult)</button>
              </div>
            </div>
          </div>

          <!-- 3. 角色属性 -->
          <div class="tab-content" id="tab-stats">
            <div class="card">
              <div class="card-title">属性调整 (tempMods 机制)</div>
              <div class="ctrl-row">
                <span>总体伤害倍率 (Damage ×N)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpDmg" value="2.0" step="0.5">
                  <button class="btn" id="btnApplyDmg">应用</button>
                </div>
              </div>
              <div class="ctrl-row">
                <span>攻击范围 (Area ×N)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpArea" value="1.5" step="0.2">
                  <button class="btn" id="btnApplyArea">应用</button>
                </div>
              </div>
              <div class="ctrl-row">
                <span>攻击速度 (Attack Speed ×N)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpAtkSpd" value="1.5" step="0.2">
                  <button class="btn" id="btnApplyAtkSpd">应用</button>
                </div>
              </div>
              <div class="ctrl-row">
                <span>额外弹射物数量 (+N)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpProj" value="2" step="1">
                  <button class="btn" id="btnApplyProj">应用</button>
                </div>
              </div>
              <div class="ctrl-row">
                <span>移动速度倍率 (Move Speed ×N)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpSpeed" value="1.5" step="0.2">
                  <button class="btn" id="btnApplySpeed">应用</button>
                </div>
              </div>
              <div class="ctrl-row">
                <span>拾取范围增加 (+N)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpPickup" value="30" step="10">
                  <button class="btn" id="btnApplyPickup">应用</button>
                </div>
              </div>
              <div class="ctrl-row">
                <span>幸运值增加 (Luck +N)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpLuck" value="200" step="50">
                  <button class="btn" id="btnApplyLuck">应用</button>
                </div>
              </div>
              <div class="btn-grid" style="margin-top: 4px;">
                <button class="btn btn-solid" id="btnApplyMildStats">注入温和实用属性 (2x伤/1.5x速/+30拾取)</button>
                <button class="btn" id="btnClearMods">重置所有属性</button>
              </div>
            </div>
          </div>

          <!-- 4. 敌人调控 -->
          <div class="tab-content" id="tab-enemies">
            <div class="card">
              <div class="card-title">敌人倍率控制</div>
              <div class="ctrl-row">
                <span>敌人血量倍率 (0.5 = 半血)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpEnemyHp" value="0.5" step="0.1">
                  <button class="btn" id="btnSetEnemyHp">设定</button>
                </div>
              </div>
              <div class="ctrl-row">
                <span>敌人伤害倍率 (0 = 无伤, 0.5 = 减半)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpEnemyDamage" value="0.5" step="0.1">
                  <button class="btn" id="btnSetEnemyDamage">设定</button>
                </div>
              </div>
              <div class="ctrl-row">
                <span>敌人移动速度 (0.7 = 减速好躲)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpEnemySpeed" value="0.7" step="0.1">
                  <button class="btn" id="btnSetEnemySpeed">设定</button>
                </div>
              </div>
              <div class="ctrl-row">
                <span>同屏敌人上限 (降低可防掉帧卡顿)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpMaxEnemies" value="300" step="50">
                  <button class="btn" id="btnSetMaxEnemies">设定</button>
                </div>
              </div>
              <div class="btn-grid" style="margin-top: 2px;">
                <button class="btn" id="btnZeroEnemyDmg">免疫敌人伤害 (0伤害)</button>
                <button class="btn" id="btnFinalSwarm">触发最终狂暴怪潮 (×6怪)</button>
              </div>
            </div>
          </div>

          <!-- 5. 闪光与捕获 -->
          <div class="tab-content" id="tab-capture">
            <div class="card">
              <div class="card-title">捕获特权</div>
              <div class="btn-grid">
                <button class="btn btn-solid" id="btnSureCapture">投球 100% 必定捕获</button>
                <button class="btn" id="btnTriggerShiny">下帧触发闪光判定</button>
              </div>
              <div class="ctrl-row" style="margin-top: 2px;">
                <span>头目捕获延长时长 (秒)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpCaptureTimeVal" value="120" min="10" step="30">
                  <button class="btn" id="btnLockCaptureTime">设置时长</button>
                </div>
              </div>
              <div class="ctrl-row">
                <span>生成指定闪光宝可梦 (图鉴编号)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpSpeciesId" value="150" placeholder="150超梦">
                  <button class="btn btn-solid" id="btnSpawnShiny">生成</button>
                </div>
              </div>
              <div class="btn-grid" style="margin-top: 2px;">
                <button class="btn" id="btnRollLegendShiny">掷一次传说闪光判定</button>
                <button class="btn" id="btnShinyBoss">将当前敌人设为闪光</button>
              </div>
            </div>
          </div>

          <!-- 6. 环境与倍速 -->
          <div class="tab-content" id="tab-world">
            <div class="card">
              <div class="card-title">游戏速度与镜头</div>
              <div class="ctrl-row">
                <span>游戏运行速度 (timeScale)</span>
                <div class="input-btn-group">
                  <input type="number" class="ctrl-input" id="inpTimeScaleVal" value="1.5" min="0.2" max="5.0" step="0.1">
                  <button class="btn btn-solid" id="btnSetTimeScale">应用速度</button>
                </div>
              </div>
              <div style="color: #ff6666; font-size: 11px; margin: 4px 0 6px 0;">切换游戏速度会100%封号，请谨慎使用</div>
              <div class="btn-grid-3 btn-grid" style="margin-top: 2px;">
                <button class="btn" id="btnSpeed05">0.5x 慢放</button>
                <button class="btn" id="btnSpeed1">1.0x 正常</button>
                <button class="btn" id="btnSpeed2">2.0x 双倍速</button>
              </div>
              <div class="btn-grid" style="margin-top: 2px;">
                <button class="btn" id="btnCamOverhead">全景俯角视角</button>
                <button class="btn" id="btnNoTrauma">关闭屏幕震动与晃屏</button>
              </div>
            </div>
            <div class="card">
              <div class="card-title">天气与关卡</div>
              <div class="ctrl-row">
                <span>即时切换天气</span>
                <div class="input-btn-group">
                  <select class="ctrl-select" id="selWeather">
                    <option value="clear">晴朗 (clear)</option>
                    <option value="sun">大晴天 (sun)</option>
                    <option value="rain">雨天 (rain)</option>
                    <option value="snow">雪天 (snow)</option>
                    <option value="sand">沙暴 (sand)</option>
                    <option value="fog">浓雾 (fog)</option>
                    <option value="storm">暴风雨 (storm)</option>
                    <option value="wind">大风 (wind)</option>
                  </select>
                  <button class="btn" id="btnSetWeather">应用</button>
                </div>
              </div>
              <div class="btn-grid" style="margin-top: 2px;">
                <button class="btn" id="btnJumpStage4">直跳第 4 阶段</button>
                <button class="btn btn-solid" id="btnInstantClear">标记直接通关</button>
              </div>
            </div>
          </div>
        </div>
        
        <div class="panel-bottom-bar">
          <button class="btn btn-reset-full" id="btnResetAll" title="重置对局内修改的所有状态，恢复游戏纯净默认">一键重置全部功能</button>
        </div>

        <div class="toast" id="toast">已生效</div>

        <div class="footer-note">
          按键盘 <b>~</b> 键呼出/隐藏面板并释放鼠标 | Esc 也可关闭
        </div>
      </div>
    `;
    shadow.appendChild(wrapper);

    const panel = shadow.getElementById('panel');
    const panelHeader = shadow.getElementById('panelHeader');
    const closeBtn = shadow.getElementById('closeBtn');
    const connStatus = shadow.getElementById('connStatus');
    const toast = shadow.getElementById('toast');

    let toastTimer = null;
    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.remove('show');
      }, 1500);
    }

    function executeWithRun(callback, desc) {
      const run = getRun();
      if (!run) {
        showToast('等待进入对局 (系统正在自动检测)...');
        return;
      }
      try {
        callback(run);
        showToast(`${desc || '操作已生效'}`);
        updateStatus();
      } catch (err) {
        console.error('[PokéBonk Trainer] 执行出错:', err);
        showToast(`出错: ${err.message}`);
      }
    }

    function updateStatus() {
      const run = getRun();
      if (run) {
        const lvl = run.player?.level || 1;
        const hp = Math.round(run.player?.hp || 0);
        const gold = run.gold || 0;
        connStatus.className = 'status-pill status-connected';
        connStatus.textContent = `对局中 (Lv.${lvl} | HP:${hp} | 金币:${gold})`;
      } else {
        connStatus.className = 'status-pill status-disconnected';
        connStatus.textContent = `等待进入对局`;
      }
    }
    setInterval(updateStatus, 800);

    // 面板开关控制（同时管理鼠标释放）
    function openPanel() {
      isPanelOpen = true;
      panel.classList.remove('hidden');
      unlockMouse();
      updateStatus();
    }

    function closePanel() {
      isPanelOpen = false;
      panel.classList.add('hidden');
    }

    function togglePanel() {
      if (panel.classList.contains('hidden')) {
        openPanel();
      } else {
        closePanel();
      }
    }

    closeBtn.addEventListener('click', closePanel);

    // 鼠标移入面板时再次确保鼠标指针处于释放状态
    panel.addEventListener('mouseenter', unlockMouse);
    panel.addEventListener('mousedown', unlockMouse);

    // 全局按键控制
    window.addEventListener('keydown', (e) => {
      // 文本框输入中不触发
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (e.key === '`' || e.key === '~' || e.key === 'Insert') {
        e.preventDefault();
        e.stopPropagation();
        togglePanel();
      } else if (e.key === 'Escape' && isPanelOpen) {
        closePanel();
      }
    }, true);

    shadow.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        shadow.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        shadow.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
        btn.classList.add('active');
        const target = shadow.getElementById(btn.getAttribute('data-tab'));
        if (target) target.classList.add('active');
      });
    });

    // 拖拽面板
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    panelHeader.addEventListener('mousedown', (e) => {
      if (e.target === closeBtn) return;
      isDragging = true;
      offsetX = e.clientX - panel.offsetLeft;
      offsetY = e.clientY - panel.offsetTop;
    });
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const newX = Math.max(10, Math.min(window.innerWidth - panel.offsetWidth - 10, e.clientX - offsetX));
      const newY = Math.max(10, Math.min(window.innerHeight - panel.offsetHeight - 10, e.clientY - offsetY));
      panel.style.left = `${newX}px`;
      panel.style.top = `${newY}px`;
      panel.style.right = 'auto';
    });
    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // --- 局内资源 ---
    shadow.getElementById('btnSetGold').addEventListener('click', () => {
      const val = parseInt(shadow.getElementById('inpGoldVal').value) || 0;
      executeWithRun((run) => {
        run.gold = Math.max(0, val);
      }, `金币已设为 ${val}`);
    });

    shadow.getElementById('btnAddGold').addEventListener('click', () => {
      const val = parseInt(shadow.getElementById('inpGoldVal').value) || 0;
      executeWithRun((run) => {
        run.gold = (run.gold || 0) + val;
      }, `已增加 ${val} 金币`);
    });

    shadow.getElementById('btnQuickGold50').addEventListener('click', () => {
      executeWithRun((run) => {
        run.gold = (run.gold || 0) + 50;
      }, '已增加 50 金币');
    });

    shadow.getElementById('btnQuickGold200').addEventListener('click', () => {
      executeWithRun((run) => {
        run.gold = (run.gold || 0) + 200;
      }, '已增加 200 金币');
    });

    shadow.getElementById('btnQuickGold1000').addEventListener('click', () => {
      executeWithRun((run) => {
        run.gold = (run.gold || 0) + 1000;
      }, '已增加 1000 金币');
    });

    shadow.getElementById('btnSetKeys').addEventListener('click', () => {
      const val = parseInt(shadow.getElementById('inpKeysVal').value) || 0;
      executeWithRun((run) => {
        run.keys = Math.max(0, val);
      }, `钥匙已设为 ${val}`);
    });

    shadow.getElementById('btnSetRerolls').addEventListener('click', () => {
      const val = parseInt(shadow.getElementById('inpRerollsVal').value) || 0;
      executeWithRun((run) => {
        run.rerolls = Math.max(0, val);
      }, `刷新次数已设为 ${val}`);
    });

    shadow.getElementById('btnSetSkips').addEventListener('click', () => {
      const val = parseInt(shadow.getElementById('inpSkipsVal').value) || 0;
      executeWithRun((run) => {
        run.skips = Math.max(0, val);
        run.banishes = Math.max(0, val);
      }, `跳过/放逐已设为 ${val}`);
    });

    shadow.getElementById('btnApplyAddXp').addEventListener('click', () => {
      const val = parseInt(shadow.getElementById('inpAddXpVal').value) || 100;
      executeWithRun((run) => {
        run.player?.addXp?.(val);
      }, `已增加 ${val} 经验`);
    });

    shadow.getElementById('btnSetXpMult').addEventListener('click', () => {
      const val = parseFloat(shadow.getElementById('inpXpMultVal').value) || 1.0;
      executeWithRun((run) => {
        if (run.diff) {
          run.diff.xpMult = val;
          run.diff.xp = val;
        }
      }, `经验倍率已设为 ${val}x`);
    });

    shadow.getElementById('btnGainLevel').addEventListener('click', () => {
      executeWithRun((run) => {
        run.player?.gainLevel?.();
      }, '已提升 1 级');
    });

    shadow.getElementById('btnXpNext1').addEventListener('click', () => {
      executeWithRun((run) => {
        if (run.player) run.player.xpNext = 1;
      }, '下级所需经验已设为 1');
    });

    shadow.getElementById('btnMoveSlots').addEventListener('click', () => {
      executeWithRun((run) => {
        if (run.player) run.player.moveSlots = 4;
      }, '招式栏位开到 4');
    });

    shadow.getElementById('btnVitaminSlots').addEventListener('click', () => {
      executeWithRun((run) => {
        if (run.player) run.player.vitaminSlots = 8;
      }, '维生素栏位开到 8');
    });

    // --- 生存与战斗 ---
    shadow.getElementById('btnGodMode').addEventListener('click', () => {
      executeWithRun((run) => {
        run.godMode = !run.godMode;
      }, '无敌模式切换');
    });

    shadow.getElementById('btnFullHeal').addEventListener('click', () => {
      executeWithRun((run) => {
        const max = run.player?.maxHp || 100;
        run.player?.heal?.(max);
        if (run.player) run.player.hp = max;
      }, '已恢复至满血');
    });

    shadow.getElementById('btnSetIframes').addEventListener('click', () => {
      const val = parseFloat(shadow.getElementById('inpIframesVal').value) || 5;
      executeWithRun((run) => {
        if (run.player) run.player.iframes = val;
      }, `无敌帧已设为 ${val} 秒`);
    });

    shadow.getElementById('btnSetInvis').addEventListener('click', () => {
      const val = parseFloat(shadow.getElementById('inpInvisVal').value) || 10;
      executeWithRun((run) => {
        if (run.player) run.player.invisT = val;
      }, `隐身已设为 ${val} 秒`);
    });

    shadow.getElementById('btnSetRevives').addEventListener('click', () => {
      const val = parseInt(shadow.getElementById('inpRevivesVal').value) || 1;
      executeWithRun((run) => {
        if (run.player) run.player.revives = val;
      }, `复活次数已设为 ${val}`);
    });

    shadow.getElementById('btnReviveDead').addEventListener('click', () => {
      executeWithRun((run) => {
        if (run.player) {
          run.player.dead = false;
          run.player.heal?.(run.player.maxHp || 100);
        }
      }, '角色已原地复活');
    });

    shadow.getElementById('btnUltReady').addEventListener('click', () => {
      executeWithRun((run) => {
        if (run.ult) {
          run.ult.charge = 1;
          run.ult.add?.(1);
        }
      }, '终极技已就绪');
    });

    // --- 角色属性 ---
    function applySingleStat(stat, mul, add, name) {
      executeWithRun((run) => {
        run.tempMods = run.tempMods || [];
        const mod = { stat };
        if (typeof mul === 'number') mod.mul = mul;
        if (typeof add === 'number') mod.add = add;
        run.tempMods.push(mod);
        run.player?.recompute?.();
      }, `${name} 属性已强化`);
    }

    shadow.getElementById('btnApplyDmg').addEventListener('click', () => {
      const val = parseFloat(shadow.getElementById('inpDmg').value) || 1.5;
      applySingleStat('damage', val, null, `伤害 ×${val}`);
    });

    shadow.getElementById('btnApplyArea').addEventListener('click', () => {
      const val = parseFloat(shadow.getElementById('inpArea').value) || 1.5;
      applySingleStat('area', val, null, `范围 ×${val}`);
    });

    shadow.getElementById('btnApplyAtkSpd').addEventListener('click', () => {
      const val = parseFloat(shadow.getElementById('inpAtkSpd').value) || 1.5;
      applySingleStat('attackSpeed', val, null, `攻速 ×${val}`);
    });

    shadow.getElementById('btnApplyProj').addEventListener('click', () => {
      const val = parseFloat(shadow.getElementById('inpProj').value) || 1;
      applySingleStat('projectiles', null, val, `弹射数 +${val}`);
    });

    shadow.getElementById('btnApplySpeed').addEventListener('click', () => {
      const val = parseFloat(shadow.getElementById('inpSpeed').value) || 1.5;
      applySingleStat('moveSpeed', val, null, `移速 ×${val}`);
    });

    shadow.getElementById('btnApplyPickup').addEventListener('click', () => {
      const val = parseFloat(shadow.getElementById('inpPickup').value) || 30;
      applySingleStat('pickupRange', null, val, `拾取范围 +${val}`);
    });

    shadow.getElementById('btnApplyLuck').addEventListener('click', () => {
      const val = parseFloat(shadow.getElementById('inpLuck').value) || 200;
      applySingleStat('luck', null, val, `幸运值 +${val}`);
    });

    shadow.getElementById('btnApplyMildStats').addEventListener('click', () => {
      executeWithRun((run) => {
        run.tempMods = run.tempMods || [];
        run.tempMods.push(
          { stat: 'damage', mul: 2.0 },
          { stat: 'moveSpeed', mul: 1.5 },
          { stat: 'attackSpeed', mul: 1.5 },
          { stat: 'pickupRange', add: 30 },
          { stat: 'luck', add: 200 }
        );
        run.player?.recompute?.();
      }, '温和属性已注入');
    });

    shadow.getElementById('btnClearMods').addEventListener('click', () => {
      executeWithRun((run) => {
        run.tempMods = [];
        run.player?.recompute?.();
      }, '所有临时属性已重置');
    });

    // --- 敌人调控 ---
    shadow.getElementById('btnSetEnemyHp').addEventListener('click', () => {
      const val = parseFloat(shadow.getElementById('inpEnemyHp').value) || 0.5;
      executeWithRun((run) => {
        if (run.diff) run.diff.enemyHp = val;
      }, `敌人血量倍率已设为 ${val}`);
    });

    shadow.getElementById('btnSetEnemyDamage').addEventListener('click', () => {
      const val = parseFloat(shadow.getElementById('inpEnemyDamage').value) || 0.5;
      executeWithRun((run) => {
        if (run.diff) run.diff.enemyDamage = val;
      }, `敌人伤害倍率已设为 ${val}`);
    });

    shadow.getElementById('btnZeroEnemyDmg').addEventListener('click', () => {
      executeWithRun((run) => {
        if (run.diff) run.diff.enemyDamage = 0;
      }, '已免疫敌人伤害');
    });

    shadow.getElementById('btnSetEnemySpeed').addEventListener('click', () => {
      const val = parseFloat(shadow.getElementById('inpEnemySpeed').value) || 0.7;
      executeWithRun((run) => {
        if (run.diff) run.diff.enemySpeed = val;
      }, `敌人移速倍率已设为 ${val}`);
    });

    shadow.getElementById('btnSetMaxEnemies').addEventListener('click', () => {
      const val = parseInt(shadow.getElementById('inpMaxEnemies').value) || 300;
      executeWithRun((run) => {
        run.maxEnemies = val;
      }, `同屏上限已设为 ${val}`);
    });

    shadow.getElementById('btnFinalSwarm').addEventListener('click', () => {
      executeWithRun((run) => {
        if (run.director) run.director.finalSwarm = true;
      }, '狂暴怪潮已触发 (×6怪)');
    });

    // --- 闪光与捕获 ---
    shadow.getElementById('btnSureCapture').addEventListener('click', () => {
      executeWithRun((run) => {
        if (run.capture) run.capture.sure = true;
      }, '100% 必定捕获已锁定');
    });

    shadow.getElementById('btnLockCaptureTime').addEventListener('click', () => {
      const val = parseFloat(shadow.getElementById('inpCaptureTimeVal').value) || 120;
      executeWithRun((run) => {
        if (run.capture) {
          run.capture.sure = true;
          run.capture.weakT = val;
          run.capture.escapeT = val;
        }
      }, `头目捕获时间已设为 ${val} 秒`);
    });

    shadow.getElementById('btnTriggerShiny').addEventListener('click', () => {
      executeWithRun((run) => {
        if (run.capture) run.capture.shinyAt = 0;
      }, '下帧闪光判定已就绪');
    });

    shadow.getElementById('btnRollLegendShiny').addEventListener('click', () => {
      executeWithRun((run) => {
        run.capture?.rollLegendShiny?.();
      }, '已掷出一次传说闪光判定');
    });

    shadow.getElementById('btnShinyBoss').addEventListener('click', () => {
      executeWithRun((run) => {
        run.capture?.shinyBoss?.(0);
      }, '已将目标设为闪光');
    });

    shadow.getElementById('btnSpawnShiny').addEventListener('click', () => {
      const id = parseInt(shadow.getElementById('inpSpeciesId').value) || 150;
      executeWithRun((run) => {
        if (run.capture?.spawnShiny) {
          run.capture.spawnShiny([id]);
        } else if (run.forceLegendary) {
          run.forceLegendary = id;
        }
      }, `强制生成闪光 [ID: ${id}]`);
    });

    // --- 环境与倍速 ---
    shadow.getElementById('btnSetTimeScale').addEventListener('click', () => {
      const val = parseFloat(shadow.getElementById('inpTimeScaleVal').value) || 1.0;
      executeWithRun((run) => {
        run.timeScale = val;
      }, `游戏速度已设为 ${val}x`);
    });

    shadow.getElementById('btnSpeed05').addEventListener('click', () => {
      executeWithRun((run) => {
        run.timeScale = 0.5;
      }, '速度已设为 0.5x 慢放');
    });

    shadow.getElementById('btnSpeed1').addEventListener('click', () => {
      executeWithRun((run) => {
        run.timeScale = 1.0;
      }, '速度已恢复 1.0x 正常');
    });

    shadow.getElementById('btnSpeed2').addEventListener('click', () => {
      executeWithRun((run) => {
        run.timeScale = 2.0;
      }, '速度已加速至 2.0x');
    });

    shadow.getElementById('btnCamOverhead').addEventListener('click', () => {
      executeWithRun((run) => {
        run.camDist = 18;
        run.camPitch = 0.9;
      }, '已切换为广角俯角');
    });

    shadow.getElementById('btnNoTrauma').addEventListener('click', () => {
      executeWithRun((run) => {
        run.trauma = 0;
        run.hitstopT = 0;
      }, '屏幕晃动已关闭');
    });

    shadow.getElementById('btnSetWeather').addEventListener('click', () => {
      const weather = shadow.getElementById('selWeather').value;
      executeWithRun((run) => {
        run.weather = weather;
      }, `天气已变更为: ${weather}`);
    });

    shadow.getElementById('btnJumpStage4').addEventListener('click', () => {
      executeWithRun((run) => {
        run.stage = 4;
        run.stageTime = 0;
      }, '已跳转至第 4 阶段');
    });

    shadow.getElementById('btnInstantClear').addEventListener('click', () => {
      executeWithRun((run) => {
        run.regionCleared = true;
      }, '已标记为通关');
    });

    // --- 一键恢复所有功能至默认 ---
    function resetAllToDefault() {
      executeWithRun((run) => {
        // 1. 生存与战斗重置
        run.godMode = false;
        if (run.player) {
          run.player.iframes = 0;
          run.player.invisT = 0;
          run.player.dead = false;
        }

        // 2. 敌人与难度倍率重置 (恢复官方基准 1.0)
        if (run.diff) {
          run.diff.enemyHp = 1.0;
          run.diff.enemyDamage = 1.0;
          run.diff.enemySpeed = 1.0;
          run.diff.enemyAmount = 1.0;
          run.diff.xpMult = 1.0;
          run.diff.xp = 1.0;
        }
        if (run.player && run.player.stats) {
          run.player.stats.difficulty = 1.0;
          run.player.stats.enemyAmount = 1.0;
        }
        run.maxEnemies = 500;
        if (run.director) {
          run.director.finalSwarm = false;
        }

        // 3. 玩家额外增益/减益属性 (tempMods) 完全清空并触发重算
        run.tempMods = [];
        run.player?.recompute?.();

        // 4. 捕获与闪光重置
        if (run.capture) {
          run.capture.sure = false;
          delete run.capture.weakT;
          delete run.capture.escapeT;
        }
        run.shinySkin = false;
        delete run.forceLegendary;

        // 5. 视角、震动与游戏速度重置
        run.timeScale = 1.0;
        run.camDist = 9;
        run.camPitch = 0.45;
        run.camYaw = 0;
        run.trauma = 0;
        run.hitstopT = 0;
        run.weather = 'clear';

        // 6. 重置所有界面的输入框数值至标准默认值
        const inputDefaults = {
          inpGoldVal: '100',
          inpKeysVal: '5',
          inpRerollsVal: '5',
          inpSkipsVal: '5',
          inpAddXpVal: '500',
          inpXpMultVal: '1.0',
          inpIframesVal: '10',
          inpInvisVal: '15',
          inpRevivesVal: '3',
          inpDmg: '1.0',
          inpArea: '1.0',
          inpAtkSpd: '1.0',
          inpProj: '0',
          inpSpeed: '1.0',
          inpPickup: '0',
          inpLuck: '0',
          inpEnemyHp: '1.0',
          inpEnemyDamage: '1.0',
          inpEnemySpeed: '1.0',
          inpMaxEnemies: '500',
          inpCaptureTimeVal: '120',
          inpSpeciesId: '150',
          inpTimeScaleVal: '1.0',
        };

        for (const [id, defaultVal] of Object.entries(inputDefaults)) {
          const el = shadow.getElementById(id);
          if (el) el.value = defaultVal;
        }
        const selW = shadow.getElementById('selWeather');
        if (selW) selW.value = 'clear';
      }, '已一键恢复所有功能至默认状态');
    }

    const btnResetAll = shadow.getElementById('btnResetAll');
    if (btnResetAll) btnResetAll.addEventListener('click', resetAllToDefault);

    const btnHeaderReset = shadow.getElementById('btnHeaderReset');
    if (btnHeaderReset) btnHeaderReset.addEventListener('click', resetAllToDefault);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }
})();
