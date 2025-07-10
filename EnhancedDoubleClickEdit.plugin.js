/**
 * @name Enhanced Double Click To Edit
 * @author headxdev
 * @version 1.1.0
 * @description Doppelklick auf eine Nachricht, um sie lokal zu bearbeiten (nur für dich sichtbar). Eigene Nachrichten können wie gewohnt bearbeitet werden.
 * @source https://github.com/headxdev/Enhanced-Double-Click-Edit/blob/main/EnhancedDoubleClickEdit.plugin.js
 */

const { React, Webpack, Data, Utils, ReactUtils } = BdApi;

const config = {};

const DEFAULTS = {
    doubleClickToEditModifier: false,
    editModifier: "shift",
    doubleClickToReply: false,
    doubleClickToReplyModifier: false,
    replyModifier: "shift",
    doubleClickToCopy: false,
    copyModifier: "shift",
    enableLocalEdit: true,
    localEditModifier: "alt"
};

const IGNORE_CLASSES = ["video", "emoji", "content", "reactionInner"];
const WALKABLE = ["child", "memoizedProps", "sibling"];

module.exports = class EnhancedDoubleClickEdit {
    constructor(meta) {
        config.info = meta;
        this.localEdits = new Map();
        this._settings = { ...DEFAULTS };
    }

    start() {
        try {
            // Module-Refs
            this.selectedClass = Webpack.getModule(Webpack.Filters.byKeys("message", "selected")).selected;
            this.messagesWrapper = Webpack.getModule(Webpack.Filters.byKeys("empty", "messagesWrapper")).messagesWrapper;
            this.copyToClipboard = Webpack.getModule(Webpack.Filters.byKeys("clipboard", "app")).clipboard.copy;
            this.replyToMessage = Webpack.getModule(m => m?.toString?.()?.replace('\n', '')?.search(/(channel:e,message:n,shouldMention:!)/) > -1, { searchExports: true });
            this.getChannel = Webpack.getModule(Webpack.Filters.byKeys("getChannel", "getDMFromUserId")).getChannel;
            this.MessageStore = Webpack.getModule(Webpack.Filters.byKeys("receiveMessage", "editMessage"));
            this.CurrentUserStore = Webpack.getModule(Webpack.Filters.byKeys("getCurrentUser"));
            this.UIModule = Webpack.getModule(m => m.FormItem && m.RadioGroup);

            // Einstellungen laden
            this.loadSettings();
            this.loadLocalEdits();

            // Event-Listener
            document.addEventListener("dblclick", this.handleDoubleClick);
            setTimeout(() => this.applyLocalEdits(), 1000);
        } catch (err) {
            console.error("Fehler beim Start:", err);
            this.stop();
        }
    }

    stop() {
        document.removeEventListener("dblclick", this.handleDoubleClick);
        this.saveLocalEdits();
    }

    /* Einstellungen */
    loadSettings() {
        for (const key in DEFAULTS) {
            this._settings[key] = Data.load(config.info.slug, key) ?? DEFAULTS[key];
        }
    }
    saveSetting(key, value) {
        this._settings[key] = value;
        Data.save(config.info.slug, key, value);
    }

    /* Lokale Bearbeitungen */
    loadLocalEdits() {
        const stored = Data.load(config.info.slug, "localEdits");
        if (stored) this.localEdits = new Map(Object.entries(stored));
    }
    saveLocalEdits() {
        Data.save(config.info.slug, "localEdits", Object.fromEntries(this.localEdits));
    }
    applyLocalEdits() {
        const messages = document.querySelectorAll('[class^="message"]');
        messages.forEach(messageElement => {
            const instance = ReactUtils.getInternalInstance(messageElement);
            if (!instance) return;
            const message = Utils.findInTree(instance, m => m?.baseMessage, { walkable: WALKABLE })?.baseMessage
                ?? Utils.findInTree(instance, m => m?.message, { walkable: WALKABLE })?.message;
            if (message && this.localEdits.has(message.id))
                this.applyLocalEditToMessage(messageElement, this.localEdits.get(message.id));
        });
    }
    applyLocalEditToMessage(messageElement, newContent) {
        const contentElement = messageElement.querySelector('[class*="messageContent"]');
        if (contentElement) {
            if (!contentElement.dataset.originalContent)
                contentElement.dataset.originalContent = contentElement.textContent;
            contentElement.textContent = newContent;
            contentElement.style.backgroundColor = 'rgba(255,255,0,0.10)';
            contentElement.style.border = '1px solid rgba(255,255,0,0.3)';
            contentElement.style.borderRadius = '3px';
            contentElement.title = 'Lokal bearbeitet (nur für dich sichtbar)';
        }
    }

    /* Doppelklick-Handler */
    handleDoubleClick = (e) => {
        if (typeof e?.target?.className !== "string" ||
            IGNORE_CLASSES.some(cls => e.target.className?.includes(cls))) return;

        const messageDiv = e.target.closest('li > [class^=message]');
        if (!messageDiv || messageDiv.classList.contains(this.selectedClass)) return;

        const instance = ReactUtils.getInternalInstance(messageDiv);
        if (!instance) return;

        if (this._settings.doubleClickToCopy && this.checkForModifier(this._settings.copyModifier, e))
            this.copyToClipboard(document.getSelection().toString());

        const message = Utils.findInTree(instance, m => m?.baseMessage, { walkable: WALKABLE })?.baseMessage
            ?? Utils.findInTree(instance, m => m?.message, { walkable: WALKABLE })?.message;
        if (!message) return;

        const isOwn = message.author.id === this.CurrentUserStore.getCurrentUser().id;

        // Lokale Bearbeitung für alle Nachrichten
        if (this._settings.enableLocalEdit && this.checkForModifier(this._settings.localEditModifier, e)) {
            const currentContent = this.localEdits.get(message.id) || message.content;
            this.openLocalEditModal(message, currentContent);
            return;
        }
        // Eigene Nachricht normal bearbeiten
        if (isOwn && (!this._settings.doubleClickToEditModifier || this.checkForModifier(this._settings.editModifier, e))) {
            this.MessageStore.startEditMessage(message.channel_id, message.id, message.content);
            return;
        }
        // Antworten auf andere Nachricht
        if (!isOwn && this._settings.doubleClickToReply && (!this._settings.doubleClickToReplyModifier || this.checkForModifier(this._settings.replyModifier, e))) {
            this.replyToMessage(this.getChannel(message.channel_id), message, e);
            return;
        }
    };

    /* Modal für lokale Bearbeitung */
    openLocalEditModal(message, currentContent) {
        // Modal-HTML
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top:0; left:0; width:100vw; height:100vh;
            background: rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:10000;`;
        modal.tabIndex = -1;

        const box = document.createElement('div');
        box.style.cssText = `
            background:#36393f; padding:24px; border-radius:8px; width:420px; max-width:90vw; color:#fff; box-shadow:0 8px 32px #0008;
            display:flex; flex-direction:column; gap:14px;`;

        const title = document.createElement('h3');
        title.innerText = "Nachricht lokal bearbeiten";
        title.style.margin = 0;

        const subtitle = document.createElement('div');
        subtitle.innerText = "Diese Änderung ist nur für dich sichtbar und lokal gespeichert.";
        subtitle.style.fontSize = "13px";
        subtitle.style.color = "#b9bbbe";

        const textarea = document.createElement('textarea');
        textarea.value = currentContent;
        textarea.style.cssText = `
            width:100%; height:100px; background:#40444b; color:#fff; border:1px solid #202225; border-radius:4px;
            padding:10px; resize:vertical; font-family:inherit; font-size:15px;`;

        const btnRow = document.createElement('div');
        btnRow.style.cssText = "display:flex; gap:12px; justify-content:flex-end;";

        const saveBtn = document.createElement('button');
        saveBtn.innerText = "Speichern";
        saveBtn.style.cssText = "background:#5865f2; color:#fff; border:none; padding:8px 18px; border-radius:4px; cursor:pointer; font-weight:600;";

        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = "Abbrechen";
        cancelBtn.style.cssText = "background:#4f545c; color:#fff; border:none; padding:8px 18px; border-radius:4px; cursor:pointer;";

        const delBtn = document.createElement('button');
        delBtn.innerText = "Lokale Bearbeitung löschen";
        delBtn.style.cssText = "background:#ed4245; color:#fff; border:none; padding:8px 18px; border-radius:4px; cursor:pointer; margin-right:auto;";
        if (this.localEdits.has(message.id)) btnRow.appendChild(delBtn);

        btnRow.append(cancelBtn, saveBtn);

        // Events
        saveBtn.onclick = () => {
            const value = textarea.value.trim();
            if (value) this.localEdits.set(message.id, value);
            else this.localEdits.delete(message.id);
            this.saveLocalEdits();
            this.applyLocalEdits();
            modal.remove();
        };
        cancelBtn.onclick = () => modal.remove();
        delBtn.onclick = () => {
            this.localEdits.delete(message.id);
            this.saveLocalEdits();
            this.applyLocalEdits();
            modal.remove();
        };
        modal.addEventListener("keydown", e => {
            if (e.key === "Escape") modal.remove();
            if (e.key === "Enter" && e.ctrlKey) saveBtn.click();
        });

        // Zusammensetzen
        box.append(title, subtitle, textarea, btnRow);
        modal.appendChild(box);
        document.body.appendChild(modal);
        textarea.focus();
        textarea.select();
    }

    /* Modifier prüfen */
    checkForModifier(modifier, event) {
        switch (modifier) {
            case "shift": return event.shiftKey;
            case "ctrl": return event.ctrlKey;
            case "alt": return event.altKey;
            default: return false;
        }
    }

    /* Settings-Panel */
    getSettingsPanel() {
        return () => {
            const [settings, setSettings] = React.useState({ ...this._settings });
            const handleSwitch = (key) => value => {
                this.saveSetting(key, value);
                setSettings(s => ({ ...s, [key]: value }));
            };
            const handleRadio = (key) => ({ value }) => {
                this.saveSetting(key, value);
                setSettings(s => ({ ...s, [key]: value }));
            };
            return React.createElement(React.Fragment, {},
                React.createElement(this.UIModule.FormSwitch, {
                    value: settings.doubleClickToEditModifier,
                    note: "Doppelklick-Bearbeitung eigener Nachrichten nur mit Modifikator",
                    onChange: handleSwitch("doubleClickToEditModifier")
                }, "Bearbeiten-Modifikator aktivieren"),
                React.createElement(this.UIModule.FormItem, {
                    disabled: !settings.doubleClickToEditModifier,
                    title: "Modifikator für eigene Nachrichten bearbeiten"
                }, React.createElement(this.UIModule.RadioGroup, {
                    disabled: !settings.doubleClickToEditModifier,
                    value: settings.editModifier,
                    options: [
                        { name: "Shift", value: "shift" },
                        { name: "Ctrl", value: "ctrl" },
                        { name: "Alt", value: "alt" }
                    ],
                    onChange: handleRadio("editModifier")
                })),
                React.createElement(this.UIModule.FormSwitch, {
                    value: settings.enableLocalEdit,
                    note: "Erlaube lokale Bearbeitung aller Nachrichten (nur für dich sichtbar)",
                    onChange: handleSwitch("enableLocalEdit")
                }, "Lokale Bearbeitung aktivieren"),
                React.createElement(this.UIModule.FormItem, {
                    disabled: !settings.enableLocalEdit,
                    title: "Modifikator für lokale Bearbeitung"
                }, React.createElement(this.UIModule.RadioGroup, {
                    disabled: !settings.enableLocalEdit,
                    value: settings.localEditModifier,
                    options: [
                        { name: "Shift", value: "shift" },
                        { name: "Ctrl", value: "ctrl" },
                        { name: "Alt", value: "alt" }
                    ],
                    onChange: handleRadio("localEditModifier")
                })),
                React.createElement(this.UIModule.FormSwitch, {
                    value: settings.doubleClickToReply,
                    note: "Doppelklick auf fremde Nachrichten zum Antworten",
                    onChange: handleSwitch("doubleClickToReply")
                }, "Antworten aktivieren"),
                React.createElement(this.UIModule.FormSwitch, {
                    disabled: !settings.doubleClickToReply,
                    value: settings.doubleClickToReplyModifier,
                    note: "Antworten nur mit Modifikator",
                    onChange: handleSwitch("doubleClickToReplyModifier")
                }, "Antworten-Modifikator aktivieren"),
                React.createElement(this.UIModule.FormItem, {
                    disabled: !settings.doubleClickToReply || !settings.doubleClickToReplyModifier,
                    title: "Modifikator zum Antworten auf Nachrichten"
                }, React.createElement(this.UIModule.RadioGroup, {
                    disabled: !settings.doubleClickToReply || !settings.doubleClickToReplyModifier,
                    value: settings.replyModifier,
                    options: [
                        { name: "Shift", value: "shift" },
                        { name: "Ctrl", value: "ctrl" },
                        { name: "Alt", value: "alt" }
                    ],
                    onChange: handleRadio("replyModifier")
                })),
                React.createElement(this.UIModule.FormSwitch, {
                    value: settings.doubleClickToCopy,
                    note: "Kopiert Auswahl vor Bearbeiten",
                    onChange: handleSwitch("doubleClickToCopy")
                }, "Kopieren aktivieren"),
                React.createElement(this.UIModule.FormItem, {
                    disabled: !settings.doubleClickToCopy,
                    title: "Modifikator zum Kopieren"
                }, React.createElement(this.UIModule.RadioGroup, {
                    disabled: !settings.doubleClickToCopy,
                    value: settings.copyModifier,
                    options: [
                        { name: "Shift", value: "shift" },
                        { name: "Ctrl", value: "ctrl" },
                        { name: "Alt", value: "alt" }
                    ],
                    onChange: handleRadio("copyModifier")
                })),
                React.createElement("button", {
                    onClick: () => {
                        this.localEdits.clear();
                        this.saveLocalEdits();
                        this.applyLocalEdits();
                    },
                    style: {
                        background: "#ed4245", color: "#fff", border: "none",
                        padding: "8px 16px", borderRadius: "4px", cursor: "pointer", marginTop: "15px"
                    }
                }, "Alle lokalen Bearbeitungen löschen")
            );
        };
    }
};
