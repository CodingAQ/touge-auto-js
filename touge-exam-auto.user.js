// ==UserScript==
// @name         头歌考试自动答题
// @namespace    https://github.com/CodingAQ/touge-exam-auto
// @version      2.0.0
// @description  头歌考试AI答题助手，支持单选题、多选题、判断题、填空题和程序填空题。
// @author       CodingAQ
// @license      MIT
// @match        *://tg.zcst.edu.cn/classrooms/*/exercise/*
// @match        *://*.educoder.net/classrooms/*/exercise/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.openai.com
// @connect      api.deepseek.com
// @connect      generativelanguage.googleapis.com
// @connect      api.anthropic.com
// @connect      dashscope.aliyuncs.com
// @connect      ark.cn-beijing.volces.com
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const BLUE = "#559CE3";
    const DARK_BG = "#2b2b2b";
    const DARK_BG2 = "#3a3a3a";
    const LIGHT_TEXT = "#ddd";
    const BORDER_COLOR = "#444";
    const GREEN = "#52c41a";
    const RED = "#e74c3c";

    console.log('%c[头歌考试助手 v2.0.0] 启动', 'color: #559CE3; font-weight: bold;');

    // ==================== DOM 选择器 ====================
    const SELECTORS = {
        QUESTION_ITEM: '.questionItem___q6Hgu',
        QUESTION_TYPE_TITLE: '.questionTypeTitle___r6Fo9',
        QUESTION_SCORE: '.questionScore___RW5tm',
        MARKDOWN_BODY: '.markdown-body',
        RADIO_WRAPPER: '.ant-radio-wrapper',
        CHECKBOX_WRAPPER: '.ant-checkbox-wrapper',
        RADIO_INPUT: 'input[type="radio"]',
        CHECKBOX_INPUT: 'input[type="checkbox"]',
        ANSWER_SHEET_ITEM: '.answerSheetItem___DIH2V',
        QUESTION_INDEX: '.qindex___XuKA8',
        SELECTED_ITEM: '.selected___grFyM',
        ANSWERED_YES: '.answerYes___AA0oM',
        CHANGE_BTN: '.changeButton___sBTjl',
        SUBMIT_BTN: '.submitButton___zPo7H',
        // 填空题
        FILL_WRAPPER: '.fill___H_Qd6',
        FILL_INPUT: 'input.ant-input.fillInput___q_sSb[type="text"]',
        FILL_INDEX: '.index___PaSVJ',
        // 程序填空题
        PROGRAM_FILL_WRAP: '.edu-program-fill-wrap',
        PROGRAM_FILL_INPUT: 'input[name="edu-program-fill"]',
        PROGRAM_CODE: '.content___QuE41',
        PROGRAM_SUBMIT: '.questionItem___q6Hgu button.ant-btn-primary'  // 题目内的"提交代码"
    };

    // ==================== 存储键名 ====================
    const STORAGE_KEYS = {
        API_PROVIDER: 'exam_api_provider',
        API_URL: 'exam_api_url',
        API_KEY: 'exam_api_key',
        API_MODEL: 'exam_api_model',
        AUTO_NEXT: 'exam_auto_next',
        NEXT_DELAY: 'exam_next_delay',
        PROGRAM_FILL_AUTO: 'exam_program_fill_auto',
        SKIP_IMAGE: 'exam_skip_image'
    };

    // ==================== API 提供商 ====================
    const API_PROVIDERS = {
        OPENAI:     { id: 'openai',   name: 'OpenAI',              defaultUrl: 'https://api.openai.com/v1/chat/completions',                    defaultModel: 'gpt-4o-mini' },
        GEMINI:     { id: 'gemini',   name: 'Gemini',              defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/models',       defaultModel: 'gemini-2.5-flash' },
        DEEPSEEK:   { id: 'deepseek', name: 'DeepSeek',            defaultUrl: 'https://api.deepseek.com/v1/chat/completions',                   defaultModel: 'deepseek-chat' },
        ALIBABA:    { id: 'alibaba',  name: '阿里（百炼平台）',      defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', defaultModel: 'qwen-turbo' },
        DOUBAO:     { id: 'doubao',   name: '豆包（火山引擎）',      defaultUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',        defaultModel: 'doubao-1.5-pro-32k' },
        CUSTOM:     { id: 'custom',   name: '自定义 (OpenAI 兼容)',  defaultUrl: '', defaultModel: '' }
    };

    // ==================== Prompt ====================
    const EXAM_SYSTEM_PROMPT = `你是考试答题专家。请根据题目内容给出正确答案。

【题型与答题规则】
1. 单选题：从 A、B、C、D 中选出唯一正确答案，返回 {"answer":"A"}
2. 多选题：从选项中选出所有正确答案，返回 {"answer":["A","C"]}
3. 判断题："正确"对应 A，"错误"对应 B
4. 填空题：有N个空，返回 {"answer":["答案1","答案2",...]}，每个元素是字符串
5. 程序填空题：代码中有N个空（标记为#填空1、#填空2等），返回应填入的代码 {"answer":["代码1","代码2",...]}

【输出格式 - 严格】
返回JSON格式。只返回JSON，禁止代码块、markdown标记或任何额外文字。`;

    // ==================== 默认配置 ====================
    const DEFAULT_CONFIG = {
        apiProvider: 'openai',
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        apiKey: '',
        model: 'gpt-4o-mini',
        autoNext: true,
        nextDelay: 2000,
        programFillAuto: true,  // 程序填空题是否自动填入
        skipImage: false        // 题目含图片则跳过
    };

    // ==================== 配置管理 ====================
    const Config = {
        load() {
            return {
                apiProvider: GM_getValue(STORAGE_KEYS.API_PROVIDER, DEFAULT_CONFIG.apiProvider),
                apiUrl: GM_getValue(STORAGE_KEYS.API_URL, DEFAULT_CONFIG.apiUrl),
                apiKey: GM_getValue(STORAGE_KEYS.API_KEY, DEFAULT_CONFIG.apiKey),
                model: GM_getValue(STORAGE_KEYS.API_MODEL, DEFAULT_CONFIG.model),
                autoNext: GM_getValue(STORAGE_KEYS.AUTO_NEXT, DEFAULT_CONFIG.autoNext),
                nextDelay: GM_getValue(STORAGE_KEYS.NEXT_DELAY, DEFAULT_CONFIG.nextDelay),
                programFillAuto: GM_getValue(STORAGE_KEYS.PROGRAM_FILL_AUTO, DEFAULT_CONFIG.programFillAuto),
                skipImage: GM_getValue(STORAGE_KEYS.SKIP_IMAGE, DEFAULT_CONFIG.skipImage)
            };
        },
        save(config) {
            GM_setValue(STORAGE_KEYS.API_PROVIDER, config.apiProvider);
            GM_setValue(STORAGE_KEYS.API_URL, config.apiUrl);
            GM_setValue(STORAGE_KEYS.API_KEY, config.apiKey);
            GM_setValue(STORAGE_KEYS.API_MODEL, config.model);
            GM_setValue(STORAGE_KEYS.AUTO_NEXT, config.autoNext);
            GM_setValue(STORAGE_KEYS.NEXT_DELAY, config.nextDelay);
            GM_setValue(STORAGE_KEYS.PROGRAM_FILL_AUTO, config.programFillAuto);
            GM_setValue(STORAGE_KEYS.SKIP_IMAGE, config.skipImage);
        },
        validate(config) {
            const errors = [];
            if (!config.apiUrl || !config.apiUrl.startsWith('http')) errors.push('API URL 格式错误');
            if (!config.apiKey || config.apiKey.trim().length === 0) errors.push('API Key 不能为空');
            if (!config.model || config.model.trim().length === 0) errors.push('模型名称不能为空');
            return { isValid: errors.length === 0, errors };
        },
        reset() { const freshCopy = { ...DEFAULT_CONFIG }; this.save(freshCopy); return freshCopy; }
    };

    let currentConfig = Config.load();

    // ==================== API 适配器 ====================
    const APIAdapter = {
        buildRequest(provider, prompt, config, images) {
            switch (provider) {
                case 'claude': return this._claude(prompt, config, images);
                case 'gemini': return this._gemini(prompt, config, images);
                default: return this._openai(prompt, config, images);
            }
        },
        _openai(prompt, config, images) {
            let messages;
            if (images && images.length > 0) {
                const content = [{ type: 'text', text: prompt }];
                images.forEach(b64 => content.push({ type: 'image_url', image_url: { url: b64 } }));
                messages = [{ role: 'user', content }];
            } else {
                messages = [{ role: 'user', content: prompt }];
            }
            return { url: config.apiUrl, method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.apiKey }, body: { model: config.model, messages, temperature: 0.3, max_tokens: 2048 } };
        },
        _claude(prompt, config, images) {
            let content;
            if (images && images.length > 0) {
                content = [];
                images.forEach(b64 => { const m = b64.match(/^data:(.+);base64,(.+)$/); if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }); });
                content.push({ type: 'text', text: prompt });
            } else { content = prompt; }
            return { url: config.apiUrl, method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }, body: { model: config.model, max_tokens: 2048, messages: [{ role: 'user', content }] } };
        },
        _gemini(prompt, config, images) {
            const parts = [];
            if (images && images.length > 0) images.forEach(b64 => { const m = b64.match(/^data:(.+);base64,(.+)$/); if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } }); });
            parts.push({ text: prompt });
            return { url: config.apiUrl + '/' + config.model + ':generateContent?key=' + config.apiKey, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { contents: [{ parts }], generationConfig: { temperature: 0.3, maxOutputTokens: 2048 } } };
        },
        parseResponse(provider, data) {
            switch (provider) {
                case 'claude': return this._parseClaude(data);
                case 'gemini': return this._parseGemini(data);
                default: return this._parseOpenAI(data);
            }
        },
        _parseOpenAI(data) { if (!data?.choices?.[0]?.message?.content) throw new Error('响应格式错误'); return data.choices[0].message.content.trim(); },
        _parseClaude(data) { const tc = data?.content?.find(c => c.type === 'text'); if (!tc?.text) throw new Error('Claude 响应格式错误'); return tc.text.trim(); },
        _parseGemini(data) { const p = data?.candidates?.[0]?.content?.parts; if (!p) throw new Error('Gemini 响应格式错误'); return p.filter(x => x.text).map(x => x.text).join('\n').trim(); }
    };

    // ==================== AI 服务 ====================
    const AIService = {
        call(prompt, config) {
            return new Promise((resolve, reject) => {
                try {
                    const req = APIAdapter.buildRequest(config.apiProvider, prompt, config, []);
                    GM_xmlhttpRequest({
                        method: req.method || 'POST', url: req.url, headers: req.headers, data: JSON.stringify(req.body), timeout: 45000,
                        onload: (resp) => {
                            if (resp.status !== 200) { reject(new Error('API 错误: ' + resp.status)); return; }
                            try { resolve(APIAdapter.parseResponse(config.apiProvider, JSON.parse(resp.responseText))); }
                            catch (e) { reject(new Error('解析失败: ' + e.message)); }
                        },
                        onerror: () => reject(new Error('网络请求失败')),
                        ontimeout: () => reject(new Error('请求超时'))
                    });
                } catch (e) { reject(e); }
            });
        },
        parseAnswer(text) {
            try { const obj = JSON.parse(text); if (obj.answer !== undefined) return obj.answer; } catch (e) {}
            const objMatch = text.match(/\{[\s\S]*?\}/);
            if (objMatch) { try { const obj = JSON.parse(objMatch[0]); if (obj.answer !== undefined) return obj.answer; } catch (e) {} }
            const arrMatch = text.match(/\[[\s\S]*\]/);
            if (arrMatch) { try { const arr = JSON.parse(arrMatch[0]); if (Array.isArray(arr)) return arr; } catch (e) {} }
            const letterMatch = text.match(/\b([A-H])\b/);
            if (letterMatch) {
                const letter = letterMatch[1];
                // Simple heuristic: if the text contains option patterns, use the letter
                return letter;
            }
            if (/不对|不正确|错误|错|否|False|false|F|×/.test(text)) return 'B';
            if (/正确|对|是|True|true|T|√/.test(text)) return 'A';
            return text.trim();
        }
    };

    // ==================== 题目提取（仅当前可见题） ====================
    function detectQuestionType(el) {
        if (el.querySelector(SELECTORS.PROGRAM_FILL_INPUT)) return 'program_fill';
        if (el.querySelector(SELECTORS.FILL_INPUT)) return 'fill';
        if (el.querySelector(SELECTORS.CHECKBOX_INPUT)) return 'multiple';
        if (el.querySelector(SELECTORS.RADIO_INPUT)) {
            const radios = el.querySelectorAll(SELECTORS.RADIO_WRAPPER);
            if (radios.length === 2) {
                const texts = Array.from(radios).map(r => r.textContent.trim());
                if (texts.some(t => /正确|错误|对|错|是|否/i.test(t))) return 'judgement';
            }
            return 'single';
        }
        return 'single';
    }

    // 提取填空题的所有空输入框
    function extractFillInputs(el) {
        const items = [];
        // 先尝试程序填空题
        const progWraps = el.querySelectorAll(SELECTORS.PROGRAM_FILL_WRAP);
        if (progWraps.length > 0) {
            progWraps.forEach((wrap, idx) => {
                // 多种方式查找输入框，适配不同嵌套层级
                let input = wrap.querySelector(SELECTORS.PROGRAM_FILL_INPUT)
                         || wrap.querySelector('input[type="text"]')
                         || wrap.querySelector('input:not([type])')
                         || wrap.querySelector('input');
                if (input) items.push({ index: idx, element: input, label: '填空' + (idx + 1) });
            });
            console.log('[提取] 程序填空题, ' + items.length + '个空');
            return items;
        }
        // 填空题
        const fillWraps = el.querySelectorAll(SELECTORS.FILL_WRAPPER);
        fillWraps.forEach((wrap, idx) => {
            const input = wrap.querySelector(SELECTORS.FILL_INPUT);
            const indexEl = wrap.querySelector(SELECTORS.FILL_INDEX);
            const label = indexEl ? indexEl.textContent.trim() : '填空' + (idx + 1);
            if (input) items.push({ index: idx, element: input, label: label });
        });
        return items;
    }

    function extractOptions(el) {
        const wrappers = el.querySelectorAll(SELECTORS.RADIO_WRAPPER + ', ' + SELECTORS.CHECKBOX_WRAPPER);
        const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        const options = [];
        wrappers.forEach((wrapper, idx) => {
            const clone = wrapper.cloneNode(true);
            clone.querySelectorAll('input, .ant-radio, .ant-checkbox, .ant-radio-inner, .ant-checkbox-inner').forEach(e => e.remove());
            let text = (clone.innerText || clone.textContent || '').trim();
            text = text.replace(/^[A-H][.\s、\u3001]*/, '').trim().replace(/\s*预览\s*$/, '').trim();
            if (!text) {
                const parent = wrapper.parentElement;
                if (parent) {
                    const pClone = parent.cloneNode(true);
                    pClone.querySelectorAll('input, .ant-radio, .ant-checkbox, .ant-radio-inner, .ant-checkbox-inner, script, style').forEach(e => e.remove());
                    text = (pClone.innerText || pClone.textContent || '').trim();
                    text = text.replace(/^[A-H][.\s、\u3001]*/, '').trim().replace(/\s*预览\s*$/, '').trim();
                }
            }
            options.push({ letter: letters[idx] || String.fromCharCode(65 + idx), text: text || '选项' + (idx + 1), element: wrapper, input: wrapper.querySelector('input[type="radio"], input[type="checkbox"]') });
        });
        return options;
    }

    function extractCurrentQuestion() {
        const item = document.querySelector(SELECTORS.QUESTION_ITEM);
        if (!item) { console.log('[提取] 未找到 questionItem'); return null; }
        const type = detectQuestionType(item);
        console.log('[提取] 检测到题型:', type);
        const md = item.querySelector(SELECTORS.MARKDOWN_BODY);
        let text = md ? (md.innerText || md.textContent || '').trim() : '';
        text = text.replace(/^\d+[、.\s]*/, '').trim();
        const options = extractOptions(item);
        const scoreEl = item.querySelector(SELECTORS.QUESTION_SCORE);
        const question = { type, text: text || '题目未提取到', score: scoreEl ? scoreEl.textContent.trim() : '', options, element: item };
        // 检测是否包含图片
        question.hasImage = !!item.querySelector('img') || /!\[.*?\]\(.*?\)|<img/i.test(item.innerHTML);
        if (question.hasImage) console.log('[提取] 题目包含图片');
        // 填空题/程序填空题：额外提取空位和代码
        if (type === 'fill' || type === 'program_fill') {
            question.fillInputs = extractFillInputs(item);
            console.log('[提取] ' + type + ', fillInputs:', question.fillInputs.length, '个',
                        question.fillInputs.map(f => f.label + ':' + (f.element.tagName || '?')));
            if (type === 'program_fill') {
                const codeArea = item.querySelector(SELECTORS.PROGRAM_CODE);
                question.codeText = codeArea ? (codeArea.innerText || codeArea.textContent || '').trim() : '';
                console.log('[提取] 程序填空代码长度:', question.codeText.length);
                // 调试：打印填空中第一个 input 的HTML
                if (question.fillInputs.length > 0) {
                    const firstInput = question.fillInputs[0].element;
                    console.log('[调试] 第一个空 input HTML:', firstInput.outerHTML.substring(0, 200));
                    console.log('[调试] 第一个空 input value:', firstInput.value);
                    console.log('[调试] 第一个空 input parent:', firstInput.parentElement ? firstInput.parentElement.outerHTML.substring(0, 200) : '无');
                }
            }
        }
        return question;
    }

    // ==================== 答案填入 ====================
    function simulateReactClick(el) {
        if (!el) return;
        let target = el;
        if (target.tagName !== 'INPUT') { const inner = target.querySelector('input[type="radio"], input[type="checkbox"]'); if (inner) target = inner; }
        ['mousedown','mouseup','click'].forEach(t => target.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true })));
        if (target.tagName === 'INPUT') { target.checked = true; target.dispatchEvent(new Event('change', { bubbles: true })); }
    }

    // execCommand insertText 填入

    // 可靠填入 React/Ant Design 受控 input 的值
    async function fillInputValue(element, value) {
        if (!element) return false;
        element.scrollIntoView({ block: 'center' });
        element.focus();
        element.click();
        element.dispatchEvent(new Event('focus', { bubbles: true }));
        await sleep(300);
        element.select();
        const oldValue = element.value;
        try { document.execCommand('insertText', false, value); } catch (e) { /* 忽略 */ }
        await sleep(100);
        if (element.value !== value) {
            // Fallback: use native value setter
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(element, value);
            } else {
                element.value = value;
            }
        }
        if (element.value === value) {
            element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(200);
            element.blur();
            element.dispatchEvent(new Event('blur', { bubbles: true }));
            await sleep(300);
            return true;
        }
        return false;
    }

    // 关闭"运行结果"弹窗（真实鼠标操作）
    async function closeResultPopup() {
        // 等待弹窗出现（最多等15秒）
        const closeSelectors = [
            '.ant-modal-close', '.ant-modal-close-x', '.ant-drawer-close',
            'button[aria-label="Close"]', 'button[aria-label="close"]',
            '.anticon-close',
            '[class*="close"]'
        ];
        let closeBtn = null;
        let modalRoot = null;
        for (let w = 0; w < 30 && !closeBtn; w++) {
            // Try to find the modal/drawer root
            const modals = document.querySelectorAll('.ant-modal, .ant-drawer');
            for (const modal of modals) {
                if (modal.offsetParent !== null) {
                    modalRoot = modal;
                    break;
                }
            }
            if (modalRoot) {
                for (const sel of closeSelectors) {
                    const btn = modalRoot.querySelector(sel);
                    if (btn && btn.offsetParent !== null) { closeBtn = btn; break; }
                }
            }
            if (!closeBtn) {
                // Fallback to global search
                for (const sel of closeSelectors) {
                    const btn = document.querySelector(sel);
                    if (btn && btn.offsetParent !== null) { closeBtn = btn; break; }
                }
            }
            if (!closeBtn) await sleep(500);
        }
        if (!closeBtn) {
            // 兜底：找所有可见的 × 按钮
            const all = document.querySelectorAll('button, span[role="img"]');
            for (const el of all) {
                if (el.offsetParent && (el.textContent.trim() === '×' || el.getAttribute('aria-label') === 'close' || el.className.includes('close'))) {
                    closeBtn = el; break;
                }
            }
        }
        if (!closeBtn) { console.log('[弹窗] 未找到关闭按钮，跳过'); return; }

        console.log('[弹窗] 找到关闭按钮，模拟鼠标点击关闭');
        const rect = closeBtn.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const m = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 };
        closeBtn.dispatchEvent(new PointerEvent('pointerdown', m));
        closeBtn.dispatchEvent(new MouseEvent('mousedown', m));
        closeBtn.dispatchEvent(new PointerEvent('pointerup', m));
        closeBtn.dispatchEvent(new MouseEvent('mouseup', m));
        closeBtn.dispatchEvent(new MouseEvent('click', m));
        await sleep(500);
    }

    async function fillAnswer(question, answer, opts) {
        if (!opts) opts = {};
        if (!question?.element) return false;

        // 填空题 / 程序填空题：直接填入文本值
        if (question.type === 'fill' || question.type === 'program_fill') {
            console.log('[填入] ' + question.type + ' 开始, 答案:', JSON.stringify(answer));
            const fillInputs = question.fillInputs;
            if (!fillInputs || fillInputs.length === 0) {
                console.warn('[填入] 未找到填空输入框! 尝试直接从question元素搜索input...');
                // 兜底：直接从题目元素查找所有input
                const allInputs = question.element.querySelectorAll('input[type="text"], input:not([type]), input[name]');
                console.log('[调试] 题目内所有input:', allInputs.length, '个');
                allInputs.forEach((inp, i) => {
                    console.log('[调试] input[' + i + ']: name=' + inp.name + ' type=' + inp.type + ' class=' + inp.className + ' value=' + inp.value + ' html=' + inp.outerHTML.substring(0, 100));
                });
                return false;
            }
            let fillAnswers = [];
            if (Array.isArray(answer)) fillAnswers = answer.map(a => String(a).trim());
            else if (typeof answer === 'string') fillAnswers = answer.split(/[;；]/).map(a => a.trim()).filter(a => a);
            if (fillAnswers.length === 0) { console.warn('[填入] 填空答案为空'); return false; }
            // Check if we have answers for all required blanks
            if (fillAnswers.length < fillInputs.length) {
                console.warn('[填入] 答案数量不足: ' + fillAnswers.length + ' < ' + fillInputs.length);
            }
            console.log('[填入] 将填入', Math.min(fillInputs.length, fillAnswers.length), '个空, 值:', fillAnswers);
            let success = true;
            for (let i = 0; i < fillInputs.length && i < fillAnswers.length; i++) {
                console.log('[填入] 填入' + fillInputs[i].label + ': ' + fillAnswers[i] + ' | input:', fillInputs[i].element.outerHTML.substring(0, 100));
                const fillSuccess = await fillInputValue(fillInputs[i].element, fillAnswers[i]);
                console.log('[填入] 填入后' + fillInputs[i].label + ' value=' + fillInputs[i].element.value);
                if (!fillSuccess || fillInputs[i].element.value !== fillAnswers[i]) {
                    console.warn('[填入] 填入失败或验证不通过: ' + fillInputs[i].label);
                    success = false;
                }
                await sleep(3000);
            }
            // If answers are missing for required blanks, mark as unsuccessful
            if (fillAnswers.length < fillInputs.length) {
                success = false;
            }
            // 程序填空题额外点击"提交代码"按钮
            if (question.type === 'program_fill' && !opts.skipSubmit) {
                await sleep(300);
                const allBtns = question.element.querySelectorAll('button.ant-btn-primary');
                let submitBtn = null;
                for (const b of allBtns) {
                    if (b.textContent.includes('提交代码')) { submitBtn = b; break; }
                }
                if (!submitBtn) {
                    console.warn('[填入] 未找到"提交代码"按钮');
                    success = false;
                } else {
                    submitBtn.click();
                    console.log('[填入] 已点击提交代码');
                    // 等待"运行结果"弹窗出现，用真实鼠标操作关闭
                    await closeResultPopup();
                }
            }
            return success;
        }

        // 选择题（单选/多选/判断）
        const options = question.options;
        if (options.length === 0) return false;

        let candidates = [];
        if (Array.isArray(answer)) candidates = answer.map(a => String(a).trim().toUpperCase()).filter(a => /^[A-H]$/.test(a));
        else if (typeof answer === 'string') {
            // Extract only standalone option letters (not embedded in words)
            const matches = answer.match(/\b[A-Ha-h]\b/g);
            if (matches) {
                candidates = matches.map(m => m.toUpperCase());
            } else {
                // Fallback: extract all letters but this is less reliable
                candidates = answer.replace(/[^A-Ha-h]/g,'').toUpperCase().split('');
            }
        }

        if (candidates.length === 0) { console.warn('[填入] 无效答案:', answer); return false; }

        let success = true;
        if (question.type !== 'multiple') {
            const target = candidates[0];
            let found = false;
            for (const opt of options) {
                if (opt.letter === target) {
                    try { simulateReactClick(opt.element); highlightOption(opt.element, true); found = true; } catch (e) { if (opt.input) { opt.input.checked = true; opt.input.dispatchEvent(new Event('change', { bubbles: true })); found = true; } }
                    console.log('[填入] 已选择:', target, opt.text.substring(0, 40));
                    break;
                }
            }
            if (!found) { console.warn('[填入] 未找到选项:', target); success = false; }
        } else {
            // 多选题：逐个点击选项，中间加间隔，避免并发导致接口异常
            for (const c of candidates) {
                let found = false;
                for (const opt of options) {
                    if (opt.letter === c) {
                        try { simulateReactClick(opt.element); highlightOption(opt.element, true); found = true; } catch (e) { if (opt.input) { opt.input.checked = true; opt.input.dispatchEvent(new Event('change', { bubbles: true })); found = true; } }
                        console.log('[填入] 已勾选:', c, opt.text.substring(0, 40));
                        await sleep(800); // 每个选项间隔800ms
                        break;
                    }
                }
                if (!found) { console.warn('[填入] 未找到选项:', c); success = false; }
            }
        }
        return success;
    }

    function highlightOption(el, selected) {
        if (!el) return;
        const wrapper = el.closest('.ant-radio-wrapper, .ant-checkbox-wrapper, label') || el;
        if (selected) { wrapper.style.color = GREEN; wrapper.style.fontWeight = 'bold'; wrapper.style.border = '2px solid ' + GREEN; wrapper.style.borderRadius = '4px'; wrapper.style.padding = '2px 6px'; }
    }

    function clearQuestion(question) {
        if (!question?.element) return;
        question.element.querySelectorAll('input[type="radio"]').forEach(e => {
            if (e.checked) e.click();
        });
        question.element.querySelectorAll('input[type="checkbox"]').forEach(e => {
            if (e.checked) e.click();
        });
    }

    // ==================== 导航 ====================
    function hasNextButton() {
        const buttons = document.querySelectorAll(SELECTORS.CHANGE_BTN);
        for (const btn of buttons) {
            if (btn.textContent.trim().includes('下一题') && btn.offsetParent !== null) return true;
        }
        return false;
    }

    function clickNextQuestion() {
        const buttons = document.querySelectorAll(SELECTORS.CHANGE_BTN);
        for (const btn of buttons) {
            if (btn.textContent.includes('下一题') && btn.offsetParent !== null) { btn.click(); console.log('[导航] 点击下一题'); return true; }
        }
        return false;
    }

    function clickPrevQuestion() {
        const buttons = document.querySelectorAll(SELECTORS.CHANGE_BTN);
        for (const btn of buttons) {
            if (btn.textContent.includes('上一题') && btn.offsetParent !== null) { btn.click(); return true; }
        }
        return false;
    }

    function getCurrentQuestionNumber() {
        const selected = document.querySelector(SELECTORS.SELECTED_ITEM);
        if (!selected) return -1;
        const idxEl = selected.querySelector(SELECTORS.QUESTION_INDEX);
        if (!idxEl) return -1;
        const num = parseInt(idxEl.textContent, 10);
        return isNaN(num) ? -1 : num;
    }

    // ==================== Toast ====================
    let toastTimer = null;
    function showToast(msg, duration) {
        if (!duration) duration = 2500;
        let toast = document.getElementById('exam-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'exam-toast';
            toast.style.cssText = 'position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%); background: ' + BLUE + '; color: #fff; padding: 8px 18px; border-radius: 4px; font-size: 13px; z-index: 2147483647; pointer-events: none; opacity: 0; transition: opacity 0.3s; font-family: "Microsoft YaHei", sans-serif;';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.style.opacity = '1';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.style.opacity = '0', duration);
    }

    // ==================== 格式化 ====================
    function formatQuestionWithOptions(question) {
        if (!question) return '未检测到题目';
        let typeLabel;
        if (question.type === 'fill') typeLabel = '【填空题】';
        else if (question.type === 'program_fill') typeLabel = '【程序填空题】';
        else if (question.type === 'multiple') typeLabel = '【多选题】';
        else if (question.type === 'judgement') typeLabel = '【判断题】';
        else typeLabel = '【单选题】';

        let text = typeLabel + ' ' + question.text + '\n';
        // 程序填空：显示代码
        if (question.type === 'program_fill' && question.codeText) {
            text += '\n--- 代码 ---\n' + question.codeText + '\n';
        }
        // 填空/程序填空：显示空位数量
        if ((question.type === 'fill' || question.type === 'program_fill') && question.fillInputs) {
            text += '\n[共 ' + question.fillInputs.length + ' 个空]\n';
        }
        // 选择题：显示选项
        if (question.options?.length > 0) {
            text += '\n';
            question.options.forEach(o => text += o.letter + '. ' + o.text + '\n');
        }
        return text;
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ==================== 自动答题 ====================
    let autoRunning = false;
    let answerHistory = []; // [{qNum, type, questionText, answer}]

    async function querySingleAnswer(question) {
        let typeLabel, promptText;

        if (question.type === 'fill') {
            typeLabel = '填空题';
            const blankCount = question.fillInputs ? question.fillInputs.length : 1;
            promptText = `题型：填空题（共${blankCount}个空）\n题目：${question.text}\n\n请返回JSON格式：{"answer":["答案1","答案2",...]}`;
        } else if (question.type === 'program_fill') {
            typeLabel = '程序填空题';
            const blankCount = question.fillInputs ? question.fillInputs.length : 1;
            promptText = `题型：程序填空题（共${blankCount}个空）\n题目：${question.text}\n`;
            if (question.codeText) promptText += `\n代码：\n${question.codeText}\n`;
            promptText += '\n请返回JSON格式：{"answer":["代码1","代码2",...]}';
        } else {
            typeLabel = question.type === 'multiple' ? '多选题' : (question.type === 'judgement' ? '判断题' : '单选题');
            promptText = `题型：${typeLabel}\n题目：${question.text}\n选项：\n${question.options.map(o => o.letter + '. ' + o.text).join('\n')}\n\n请返回JSON格式：{"answer":"A"} 或 {"answer":["A","C"]}`;
        }

        const raw = await AIService.call(EXAM_SYSTEM_PROMPT + '\n\n' + promptText, currentConfig);
        const answer = AIService.parseAnswer(raw);
        console.log('[AI] ' + typeLabel + ' 答案:', JSON.stringify(answer));
        return answer;
    }

    async function runAutoAnswer() {
        if (!currentConfig.apiKey) { showToast('请先在设置中填写 API Key'); return; }

        autoRunning = true;
        updateSmartBtnState(true);
        answerHistory = [];
        let successCount = 0, failCount = 0, skipCount = 0;

        while (autoRunning) {
            // ① 提取当前可见题目
            updateStatusText('正在提取当前题目...');
            const question = extractCurrentQuestion();
            if (!question) { console.log('[答题] 未检测到题目，停止'); break; }

            // 开关：题目含图片则跳过
            if (currentConfig.skipImage && question.hasImage) {
                console.log('[答题] 题目含图片，已跳过');
                skipCount++;
                const answeredTotal = successCount + failCount + skipCount;
                appendLog('【#' + answeredTotal + (getCurrentQuestionNumber() > 0 ? ' 题号' + getCurrentQuestionNumber() : '') + '】[图片] 已跳过');
                updateProgress(answeredTotal);
                await sleep(currentConfig.nextDelay || 2000);
                if (!hasNextButton()) { console.log('[答题] 没有下一题，完成'); break; }
                if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
                clickNextQuestion();
                await sleep(700);
                continue;
            }

            const qNum = getCurrentQuestionNumber();
            updateStatusText('AI思考中 (第' + (qNum > 0 ? qNum : '?') + '题)...');
            updateProgress(successCount + failCount + 1);
            updateQuestionDisplay(formatQuestionWithOptions(question));

            // 选题延迟
            await sleep(currentConfig.nextDelay || 2000);

            // ② AI 获取答案
            let answer = null;
            try { answer = await querySingleAnswer(question); }
            catch (e) { console.error('[答题] AI失败:', e.message); answer = null; }

            answerHistory.push({ qNum: qNum, type: question.type, questionText: question.text, answer: answer });
            updateAnswerDisplay(answer, question);

            if (!autoRunning) break;

            // ③ 填入答案
            if (answer) {
                updateStatusText('填入答案 (第' + (qNum > 0 ? qNum : '?') + '题)...');
                if (question.type === 'program_fill') {
                    console.log('[调试] 程序填空 answer类型:', typeof answer, '值:', JSON.stringify(answer));
                    console.log('[调试] 程序填空 fillInputs数:', question.fillInputs ? question.fillInputs.length : '无');
                }
                // 程序填空题且开关关闭 → 仅展示答案，不填入
                if (question.type === 'program_fill' && !currentConfig.programFillAuto) {
                    console.log('[答题] 程序填空自动填入已关闭，仅展示答案');
                    successCount++; // 不算失败
                } else {
                    clearQuestion(question);
                    await sleep(100);
                    if (await fillAnswer(question, answer)) successCount++;
                    else failCount++;
                }
            } else { failCount++; }

            // 追加日志
            const answeredTotal = successCount + failCount + skipCount;
            let typeTag = '[单选]';
            if (question.type === 'multiple') typeTag = '[多选]';
            else if (question.type === 'judgement') typeTag = '[判断]';
            else if (question.type === 'fill') typeTag = '[填空]';
            else if (question.type === 'program_fill') typeTag = '[程序填空]';
            appendLog('【#' + answeredTotal + (qNum > 0 ? ' 题号' + qNum : '') + '】' + typeTag +
                       ' 答案: ' + (answer ? JSON.stringify(answer) : '无') +
                       ' → ' + (answer ? ((question.type === 'program_fill' && !currentConfig.programFillAuto) ? '仅展示' : '已填入') : '失败'));

            if (!autoRunning) break;

            // 答完等待 1000-1200ms
            await sleep(1000 + Math.random() * 200);

            // ④ 检查「下一题」及自动翻题开关
            if (!hasNextButton()) { console.log('[答题] 没有下一题，完成'); break; }
            if (!currentConfig.autoNext) { console.log('[答题] 自动翻题已关闭，停止'); break; }

            // ⑤ 翻题前记录当前题目标识
            const beforeNavText = question.text.substring(0, 50);
            const beforeNavNum = qNum;

            // ⑥ 翻题（先释放焦点，避免填空输入框劫持事件）
            updateStatusText('翻到下一题...');
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
            const navSuccess = clickNextQuestion();
            if (!navSuccess) {
                console.log('[答题] 点击下一题失败，停止');
                break;
            }
            await sleep(700);

            // ⑦ 验证题目是否真的改变了
            const afterQuestion = extractCurrentQuestion();
            if (afterQuestion) {
                const afterNavText = afterQuestion.text.substring(0, 50);
                const afterNavNum = getCurrentQuestionNumber();
                if (afterNavText === beforeNavText && afterNavNum === beforeNavNum) {
                    console.log('[答题] 题目未改变，停止以避免重复处理');
                    break;
                }
            }
        }

        autoRunning = false;
        updateSmartBtnState(false);
        const answeredTotal = successCount + failCount + skipCount;
        updateStatusText('完成！' + successCount + '题成功, ' + failCount + '题失败' + (skipCount > 0 ? ', ' + skipCount + '题跳过' : ''));
        updateProgress(answeredTotal);
        appendLog('── 答题结束：成功 ' + successCount + '，失败 ' + failCount + (skipCount > 0 ? '，跳过 ' + skipCount : '') + ' ──');
        showToast('自动答题完成 (' + successCount + '/' + answeredTotal + ')');
        console.log('[答题] 完成:', successCount, '成功,', failCount, '失败,', skipCount, '跳过');
    }

    // ==================== UI ====================
    let gStatusEl, gQuestionText, gAnswerText, gSmartBtn, gProgressEl, gLogArea;

    function updateStatusText(text) { console.log('[状态]', text); if (gStatusEl) gStatusEl.textContent = text; }
    function updateProgress(count) { if (gProgressEl) gProgressEl.textContent = '(已答 ' + count + ' 题)'; }
    function updateSmartBtnState(running) { if (!gSmartBtn) return; gSmartBtn.textContent = running ? '停止' : '智能答题'; gSmartBtn.style.background = running ? RED : BLUE; }
    function updateAnswerDisplay(answer, question) {
        if (!gAnswerText) return;
        // 填空题/程序填空题：逐行展示每个空的答案+复制按钮
        if (question && (question.type === 'fill' || question.type === 'program_fill') && Array.isArray(answer)) {
            let html = '';
            answer.forEach((a, i) => {
                const raw = String(a);
                const txt = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
                html += '<div class="exam-copy-row" data-copy="' + txt + '" style="display:flex;align-items:center;gap:4px;margin-bottom:2px;color:' + LIGHT_TEXT + ';font-weight:normal;cursor:pointer;padding:1px 0;" title="点击复制">'
                     + '<span style="flex-shrink:0;opacity:0.5;">'
                     + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
                     + '</span>'
                     + '<span style="flex:1;word-break:break-all;">' + (i+1) + '. ' + txt + '</span>'
                     + '</div>';
            });
            gAnswerText.innerHTML = html;
            // 事件委托：点击行复制
            gAnswerText.querySelectorAll('.exam-copy-row').forEach(row => {
                row.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const raw = this.getAttribute('data-copy');
                    navigator.clipboard.writeText(raw)
                        .then(() => showToast('已复制', 1500))
                        .catch(() => showToast('复制失败', 1500));
                });
            });
        } else {
            gAnswerText.textContent = answer ? (typeof answer === 'string' ? answer : JSON.stringify(answer)) : '暂无答案';
        }
    }
    function updateQuestionDisplay(text) { if (!gQuestionText) return; gQuestionText.textContent = text || '未检测到题目'; }
    function appendLog(msg) {
        if (!gLogArea) return;
        const lines = gLogArea.textContent.split('\n').filter(l => l.trim());
        lines.push(msg);
        if (lines.length > 20) lines.splice(0, lines.length - 20);
        gLogArea.textContent = lines.join('\n');
        gLogArea.scrollTop = gLogArea.scrollHeight;
    }

    function makeDraggable(panel, handle) {
        let ox = 0, oy = 0, dragging = false;
        handle.style.cursor = 'move';
        handle.addEventListener('mousedown', e => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('button') || e.target.closest('input')) return;
            dragging = true; const rect = panel.getBoundingClientRect(); ox = e.clientX - rect.left; oy = e.clientY - rect.top; panel.style.transition = 'none'; e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            let x = e.clientX - ox, y = e.clientY - oy;
            x = Math.max(0, Math.min(x, window.innerWidth - panel.offsetWidth));
            y = Math.max(0, Math.min(y, window.innerHeight - panel.offsetHeight));
            panel.style.left = x + 'px'; panel.style.top = y + 'px'; panel.style.right = 'auto';
        });
        document.addEventListener('mouseup', () => { if (dragging) { dragging = false; panel.style.transition = ''; } });
    }

    function createInputField(label, key, placeholder, isPassword) {
        const w = document.createElement('div'); w.style.cssText = 'padding:4px 0;display:flex;flex-direction:column;gap:3px;';
        const lbl = document.createElement('span'); lbl.textContent = label; lbl.style.cssText = 'color:' + LIGHT_TEXT + ';font-size:12px;';
        const inp = document.createElement('input'); inp.type = isPassword ? 'password' : 'text';
        inp.style.cssText = 'width:100%;box-sizing:border-box;padding:5px 8px;background:' + DARK_BG2 + ';border:1px solid ' + BORDER_COLOR + ';border-radius:4px;color:' + LIGHT_TEXT + ';font-size:12px;outline:none;';
        inp.value = currentConfig[key] || ''; inp.placeholder = placeholder || '';
        inp.addEventListener('focus', () => inp.style.borderColor = BLUE);
        inp.addEventListener('blur', () => { inp.style.borderColor = BORDER_COLOR; currentConfig[key] = inp.value.trim(); Config.save(currentConfig); });
        w.appendChild(lbl); w.appendChild(inp); return { wrapper: w, input: inp };
    }

    function createSelectField(label, key, options) {
        const w = document.createElement('div'); w.style.cssText = 'padding:4px 0;display:flex;flex-direction:column;gap:3px;';
        const lbl = document.createElement('span'); lbl.textContent = label; lbl.style.cssText = 'color:' + LIGHT_TEXT + ';font-size:12px;';
        const sel = document.createElement('select');
        sel.style.cssText = 'width:100%;box-sizing:border-box;padding:5px 8px;background:' + DARK_BG2 + ';border:1px solid ' + BORDER_COLOR + ';border-radius:4px;color:' + LIGHT_TEXT + ';font-size:12px;outline:none;';
        options.forEach(o => { const opt = document.createElement('option'); opt.value = o.value; opt.textContent = o.label; sel.appendChild(opt); });
        sel.value = currentConfig[key] || options[0].value;
        sel.addEventListener('focus', () => sel.style.borderColor = BLUE);
        sel.addEventListener('blur', () => { sel.style.borderColor = BORDER_COLOR; currentConfig[key] = sel.value; Config.save(currentConfig); });
        w.appendChild(lbl); w.appendChild(sel); return { wrapper: w, select: sel };
    }

    function createToggle(label, key) {
        const w = document.createElement('div'); w.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 0;';
        const lbl = document.createElement('span'); lbl.textContent = label; lbl.style.cssText = 'color:' + LIGHT_TEXT + ';font-size:12px;';
        const toggle = document.createElement('div'); toggle.style.cssText = 'width:36px;height:20px;border-radius:10px;cursor:pointer;transition:background 0.2s;position:relative;flex-shrink:0;';
        const knob = document.createElement('div'); knob.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;top:2px;left:2px;transition:left 0.2s;';
        toggle.appendChild(knob);
        const redraw = v => { toggle.style.background = v ? BLUE : '#666'; knob.style.left = v ? '18px' : '2px'; };
        redraw(currentConfig[key]);
        toggle.addEventListener('click', () => { currentConfig[key] = !currentConfig[key]; redraw(currentConfig[key]); Config.save(currentConfig); });
        w.appendChild(lbl); w.appendChild(toggle); return w;
    }

    function buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'exam-panel';
        panel.style.cssText = 'position:fixed;top:80px;right:16px;z-index:2147483646;background:' + DARK_BG + ';border:1px solid ' + BORDER_COLOR + ';border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:"Microsoft YaHei","PingFang SC",sans-serif;user-select:auto;display:flex;flex-direction:column;width:380px;max-height:85vh;';

        // Header
        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;gap:6px;flex-shrink:0;user-select:none;';
        const title = document.createElement('span'); title.textContent = '考试助手'; title.style.cssText = 'color:' + BLUE + ';font-size:14px;font-weight:bold;white-space:nowrap;';
        gStatusEl = document.createElement('span'); gStatusEl.style.cssText = 'color:#888;font-size:11px;flex:1;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        gProgressEl = document.createElement('span'); gProgressEl.textContent = '(已答 0 题)'; gProgressEl.style.cssText = 'color:#888;font-size:11px;white-space:nowrap;';

        const collapseBtn = document.createElement('button'); collapseBtn.textContent = '−'; collapseBtn.title = '收起';
        collapseBtn.style.cssText = 'width:24px;height:24px;border:none;background:transparent;cursor:pointer;border-radius:4px;color:#888;font-size:16px;padding:0;flex-shrink:0;';
        collapseBtn.addEventListener('mouseenter', () => collapseBtn.style.color = LIGHT_TEXT);
        collapseBtn.addEventListener('mouseleave', () => collapseBtn.style.color = '#888');

        const settingsBtn = document.createElement('button'); settingsBtn.title = '设置';
        settingsBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
        settingsBtn.style.cssText = 'width:24px;height:24px;border:none;background:transparent;cursor:pointer;border-radius:4px;color:#888;padding:0;flex-shrink:0;';
        settingsBtn.addEventListener('mouseenter', () => settingsBtn.style.color = LIGHT_TEXT);
        settingsBtn.addEventListener('mouseleave', () => settingsBtn.style.color = '#888');

        hdr.appendChild(title); hdr.appendChild(gStatusEl); hdr.appendChild(gProgressEl); hdr.appendChild(collapseBtn); hdr.appendChild(settingsBtn);
        panel.appendChild(hdr);

        // Body
        const body = document.createElement('div'); body.style.cssText = 'display:flex;flex-direction:column;overflow:hidden;border-top:1px solid ' + BORDER_COLOR + ';';
        panel.appendChild(body);

        // Buttons
        const ctrl = document.createElement('div'); ctrl.style.cssText = 'display:flex;gap:4px;padding:8px 10px;border-bottom:1px solid ' + BORDER_COLOR + ';flex-wrap:wrap;';
        const btnS = 'background:' + DARK_BG2 + ';color:' + LIGHT_TEXT + ';border:1px solid ' + BORDER_COLOR + ';padding:5px 8px;border-radius:4px;cursor:pointer;font-size:11px;font-family:"Microsoft YaHei",sans-serif;';
        const priS = 'background:' + BLUE + ';color:#fff;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-family:"Microsoft YaHei",sans-serif;';

        gSmartBtn = document.createElement('button'); gSmartBtn.textContent = '智能答题'; gSmartBtn.style.cssText = priS;
        const fillBtn = document.createElement('button'); fillBtn.textContent = '填入此题'; fillBtn.title = '仅对当前显示的题目AI获取答案并填入'; fillBtn.style.cssText = priS;
        const fetchAnswerBtn = document.createElement('button'); fetchAnswerBtn.textContent = '获取答案'; fetchAnswerBtn.title = '仅查询AI答案，不填入'; fetchAnswerBtn.style.cssText = btnS;
        const prevBtn = document.createElement('button'); prevBtn.textContent = '◀'; prevBtn.title = '上一题'; prevBtn.style.cssText = btnS;
        const nextBtn = document.createElement('button'); nextBtn.textContent = '▶'; nextBtn.title = '下一题'; nextBtn.style.cssText = btnS;
        const detectBtn = document.createElement('button'); detectBtn.textContent = '重新检测'; detectBtn.title = '重新提取当前显示的题目'; detectBtn.style.cssText = btnS;

        ctrl.appendChild(gSmartBtn); ctrl.appendChild(fillBtn); ctrl.appendChild(fetchAnswerBtn); ctrl.appendChild(prevBtn); ctrl.appendChild(nextBtn); ctrl.appendChild(detectBtn);
        body.appendChild(ctrl);

        // Question area
        const qSec = document.createElement('div'); qSec.style.cssText = 'padding:8px 10px;border-bottom:1px solid ' + BORDER_COLOR + ';';
        const qLbl = document.createElement('div'); qLbl.textContent = '当前题目'; qLbl.style.cssText = 'color:' + BLUE + ';font-size:11px;margin-bottom:3px;font-weight:bold;';
        gQuestionText = document.createElement('div'); gQuestionText.style.cssText = 'color:' + LIGHT_TEXT + ';font-size:12px;line-height:1.5;max-height:200px;overflow-y:auto;word-break:break-all;';
        qSec.appendChild(qLbl); qSec.appendChild(gQuestionText);
        body.appendChild(qSec);

        // Answer area
        const aSec = document.createElement('div'); aSec.style.cssText = 'padding:8px 10px;border-bottom:1px solid ' + BORDER_COLOR + ';';
        const aLbl = document.createElement('div'); aLbl.textContent = 'AI 答案'; aLbl.style.cssText = 'color:' + BLUE + ';font-size:11px;margin-bottom:3px;font-weight:bold;';
        gAnswerText = document.createElement('div'); gAnswerText.style.cssText = 'color:' + GREEN + ';font-size:12px;line-height:1.5;max-height:120px;overflow-y:auto;word-break:break-all;font-weight:bold;';
        aSec.appendChild(aLbl); aSec.appendChild(gAnswerText);
        body.appendChild(aSec);

        // Log area
        const logSec = document.createElement('div'); logSec.style.cssText = 'padding:8px 10px;';
        const logLbl = document.createElement('div'); logLbl.textContent = '答题日志'; logLbl.style.cssText = 'color:' + BLUE + ';font-size:11px;margin-bottom:3px;font-weight:bold;';
        gLogArea = document.createElement('div'); gLogArea.style.cssText = 'color:#aaa;font-size:11px;line-height:1.4;max-height:150px;overflow-y:auto;word-break:break-all;font-family:Consolas,monospace;white-space:pre-wrap;';
        logSec.appendChild(logLbl); logSec.appendChild(gLogArea);
        body.appendChild(logSec);

        // Settings (hidden)
        const setPanel = document.createElement('div'); setPanel.style.cssText = 'display:none;flex-direction:column;padding:6px 10px;max-height:300px;overflow-y:auto;';
        const provOpts = [{value:'openai',label:'OpenAI'},{value:'gemini',label:'Gemini'},{value:'deepseek',label:'DeepSeek'},{value:'alibaba',label:'阿里（百炼）'},{value:'doubao',label:'豆包（火山引擎）'},{value:'custom',label:'自定义'}];
        const provF = createSelectField('API 提供商', 'apiProvider', provOpts);
        const urlF = createInputField('API 地址', 'apiUrl', 'https://api.openai.com/v1/chat/completions');
        const keyF = createInputField('API Key', 'apiKey', 'sk-...', true);
        const modelF = createInputField('模型名称', 'model', 'gpt-4o-mini');
        const delayF = createSelectField('选题延迟', 'nextDelay', [{value:1000,label:'1秒（快速）'},{value:2000,label:'2秒（默认）'},{value:3000,label:'3秒'},{value:5000,label:'5秒（稳定）'},{value:10000,label:'10秒'}]);
        const autoToggle = createToggle('自动翻题', 'autoNext');
        const pfAutoToggle = createToggle('程序填空自动填入', 'programFillAuto');
        const skipImgToggle = createToggle('题目含图片则跳过', 'skipImage');
        const saveBtn = document.createElement('button'); saveBtn.textContent = '保存设置'; saveBtn.style.cssText = priS + ' margin-top:4px;';
        const resetBtn = document.createElement('button'); resetBtn.textContent = '重置默认'; resetBtn.style.cssText = btnS + ' margin-top:4px;';

        setPanel.appendChild(provF.wrapper); setPanel.appendChild(urlF.wrapper); setPanel.appendChild(keyF.wrapper);
        setPanel.appendChild(modelF.wrapper); setPanel.appendChild(delayF.wrapper); setPanel.appendChild(autoToggle);
        setPanel.appendChild(pfAutoToggle);
        setPanel.appendChild(skipImgToggle);
        setPanel.appendChild(saveBtn); setPanel.appendChild(resetBtn);
        body.appendChild(setPanel);

        document.body.appendChild(panel);

        // State
        let expanded = true, settingsOpen = false;

        // Events
        collapseBtn.addEventListener('click', () => { expanded = !expanded; body.style.display = expanded ? 'flex' : 'none'; collapseBtn.textContent = expanded ? '−' : '□'; });

        settingsBtn.addEventListener('click', () => {
            settingsOpen = !settingsOpen; setPanel.style.display = settingsOpen ? 'flex' : 'none'; settingsBtn.style.color = settingsOpen ? BLUE : '#888';
            if (settingsOpen) { provF.select.value = currentConfig.apiProvider; urlF.input.value = currentConfig.apiUrl; keyF.input.value = currentConfig.apiKey; modelF.input.value = currentConfig.model; delayF.select.value = currentConfig.nextDelay; }
        });

        provF.select.addEventListener('change', () => {
            const p = Object.values(API_PROVIDERS).find(x => x.id === provF.select.value);
            if (p) { urlF.input.value = p.defaultUrl; modelF.input.value = p.defaultModel; currentConfig.apiProvider = p.id; currentConfig.apiUrl = p.defaultUrl; currentConfig.model = p.defaultModel; Config.save(currentConfig); }
        });

        saveBtn.addEventListener('click', () => {
            currentConfig.apiProvider = provF.select.value; currentConfig.apiUrl = urlF.input.value.trim();
            currentConfig.apiKey = keyF.input.value.trim(); currentConfig.model = modelF.input.value.trim();
            currentConfig.nextDelay = parseInt(delayF.select.value, 10) || 2000;
            if (!Config.validate(currentConfig).isValid) { showToast(Config.validate(currentConfig).errors[0]); return; }
            Config.save(currentConfig); showToast('设置已保存');
            settingsOpen = false; setPanel.style.display = 'none'; settingsBtn.style.color = '#888';
        });

        resetBtn.addEventListener('click', () => {
            if (confirm('确定要重置为默认配置吗？\n\n这将清除所有自定义设置（包括 API Key）')) {
                currentConfig = Config.reset(); provF.select.value = currentConfig.apiProvider; urlF.input.value = currentConfig.apiUrl;
                keyF.input.value = currentConfig.apiKey; modelF.input.value = currentConfig.model; delayF.select.value = currentConfig.nextDelay; showToast('已重置');
            }
        });

        prevBtn.addEventListener('click', () => { clickPrevQuestion(); sleep(300).then(() => { const q = extractCurrentQuestion(); if (q) updateQuestionDisplay(formatQuestionWithOptions(q)); }); });
        nextBtn.addEventListener('click', () => { clickNextQuestion(); sleep(300).then(() => { const q = extractCurrentQuestion(); if (q) updateQuestionDisplay(formatQuestionWithOptions(q)); }); });

        gSmartBtn.addEventListener('click', async () => {
            if (autoRunning) { autoRunning = false; updateSmartBtnState(false); updateStatusText('已停止'); return; }
            await runAutoAnswer();
        });

        fillBtn.addEventListener('click', async () => {
            if (!currentConfig.apiKey) { showToast('请先填写 API Key'); return; }
            const q = extractCurrentQuestion();
            if (!q) { showToast('未检测到题目'); return; }
            updateStatusText('AI思考中...'); updateQuestionDisplay(formatQuestionWithOptions(q));
            fillBtn.disabled = true;
            try {
                const answer = await querySingleAnswer(q);
                updateAnswerDisplay(answer, q);
                if (answer) { clearQuestion(q); await sleep(100); await fillAnswer(q, answer, { skipSubmit: true }); updateStatusText('已填入'); showToast('答案已填入'); }
                else { updateStatusText('AI 未返回有效答案'); showToast('AI 未返回有效答案'); }
            } catch (e) { updateStatusText('查询失败'); showToast(e.message); }
            finally { fillBtn.disabled = false; }
        });

        fetchAnswerBtn.addEventListener('click', async () => {
            if (!currentConfig.apiKey) { showToast('请先填写 API Key'); return; }
            const q = extractCurrentQuestion();
            if (!q) { showToast('未检测到题目'); return; }
            updateStatusText('AI思考中...'); updateQuestionDisplay(formatQuestionWithOptions(q));
            fetchAnswerBtn.disabled = true;
            try {
                const answer = await querySingleAnswer(q);
                updateAnswerDisplay(answer, q);
                updateStatusText('答案已获取'); showToast('答案已获取');
            } catch (e) { updateStatusText('查询失败'); showToast(e.message); }
            finally { fetchAnswerBtn.disabled = false; }
        });

        detectBtn.addEventListener('click', () => {
            const q = extractCurrentQuestion();
            if (q) { updateQuestionDisplay(formatQuestionWithOptions(q)); updateStatusText('已检测到题目'); showToast('已提取当前题目'); }
            else { updateStatusText('未检测到题目'); showToast('未检测到题目'); }
        });

        makeDraggable(panel, hdr);

        // Init
        updateStatusText('就绪');
        updateQuestionDisplay('等待检测题目...');
        updateAnswerDisplay('暂无答案');

        if (!currentConfig.apiKey || currentConfig.apiKey.trim().length === 0) {
            setTimeout(() => { settingsBtn.click(); updateStatusText('请配置 API Key'); }, 1000);
        }

        // Auto-detect current question
        let attempts = 0, maxAttempts = 8;
        const iv = setInterval(() => {
            attempts++;
            const q = extractCurrentQuestion();
            if (q) { clearInterval(iv); updateQuestionDisplay(formatQuestionWithOptions(q)); updateStatusText('就绪'); console.log('[自动检测] 题目就绪'); }
            else if (attempts >= maxAttempts) { clearInterval(iv); updateStatusText('未检测到题目，点击"重新检测"'); }
        }, 800);
    }

    // ==================== 启动 ====================
    function init() {
        try { console.log('[初始化] 开始构建面板...'); buildPanel(); console.log('[初始化] 完成'); }
        catch (e) { console.error('[初始化] 失败:', e); }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();
