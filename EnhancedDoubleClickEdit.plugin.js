/**
 * @name Enhanced Double Click To Edit
 * @author headxdev
 * @version 1.2.0
 * @description Doppelklick auf eigene Nachrichten zum Bearbeiten. Optional: Doppelklick auf fremde zum Antworten, Rechtsklick auf fremde zum lokalen Bearbeiten.
 * @source https://github.com/headxdev/Enhanced-Double-Click-Edit/blob/main/EnhancedDoubleClickEdit.plugin.js
 */

const { React, Webpack, Data, Utils, ReactUtils } = BdApi;

const config = {};

const DEFAULTS = {
    doubleClickToReply: false,
    doubleClickToReplyModifier: false,
    replyModifier: "shift",
    enableRightClickEdit: false,
    rightClickEditModifier: false,
    rightClickModifier: "ctrl"
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
            this.selectedClass = Webpack.getModule(Webpack.Filters.byKeys("message", "selected"))?.selected;
            this.messagesWrapper = Webpack.getModule(Webpack.Filters.byKeys("empty", "messagesWrapper"))?.messagesWrapper;
            this.replyToMessage = Webpack.getModule(m => m?.toString?.()?.replace('\n', '')?.search(/(channel:e,message:n,shouldMention:!)/) > -1, { searchExports: true });
            this.getChannel = Webpack.getModule(Webpack.Filters.byKeys("getChannel", "getDMFromUserId"))?.getChannel;
            this.MessageStore = Webpack.getModule(Webpack.Filters.byKeys("receiveMessage", "editMessage"));
            this.CurrentUserStore = Webpack.getModule(Webpack.Filters.byKeys("getCurrentUser"));
            
            // Sichere UI-Modul-Suche
            this.UIModule = Webpack.getModule(m => m?.FormItem && m?.RadioGroup) || 
                           Webpack.getModule(m => m?.FormSwitch) || 
                           Webpack.getModule(Webpack.Filters.byKeys("FormItem", "RadioGroup"));

            // Fallback für UI-Komponenten
            if (!this.UIModule) {
                this.UIModule = {
                    FormSwitch: React.forwardRef((props, ref) => {
                        return React.createElement('div', {
                            style: { display: 'flex', alignItems: 'center', marginBottom: '16px' }
                        }, [
                            React.createElement('input', {
                                key: 'input',
                                type: 'checkbox',
                                checked: props.value,
                                onChange: (e) => props.onChange(e.target.checked),
                                style: { marginRight: '8px' }
                            }),
                            React.createElement('label', {
                                key: 'label',
                                style: { color: '#fff', fontSize: '14px' }
                            }, props.children),
                            props.note && React.createElement('div', {
                                key: 'note',
                                style: { fontSize: '12px', color: '#b9bbbe', marginLeft: '8px' }
                            }, props.note)
                        ]);
                    }),
                    FormItem: React.forwardRef((props, ref) => {
                        return React.createElement('div', {
                            style: { 
                                marginBottom: '16px', 
                                opacity: props.disabled ? 0.5 : 1 
                            }
                        }, [
                            props.title && React.createElement('h4', {
                                key: 'title',
                                style: { color: '#fff', marginBottom: '8px', fontSize: '14px' }
                            }, props.title),
                            props.children
                        ]);
                    }),
                    RadioGroup: React.forwardRef((props, ref) => {
                        return React.createElement('div', {
                            style: { display: 'flex', flexDirection: 'column', gap: '8px' }
                        }, props.options?.map((option, index) => 
                            React.createElement('label', {
                                key: index,
                                style: { 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    color: '#fff',
                                    fontSize: '14px',
                                    opacity: props.disabled ? 0.5 : 1,
                                    cursor: props.disabled ? 'not-allowed' : 'pointer'
                                }
                            }, [
                                React.createElement('input', {
                                    key: 'radio',
                                    type: 'radio',
                                    name: `radio-${Math.random()}`,
                                    value: option.value,
                                    checked: props.value === option.value,
                                    onChange: () => !props.disabled && props.onChange({ value: option.value }),
                                    disabled: props.disabled,
                                    style: { marginRight: '8px' }
                                }),
                                option.name
                            ])
                        ));
                    })
                };
            }

            // Einstellungen laden
            this.loadSettings();
            this.loadLocalEdits();

            // Event-Listener
            document.addEventListener("dblclick", this.handleDoubleClick);
            document.addEventListener("contextmenu", this.handleRightClick);
            setTimeout(() => this.applyLocalEdits(), 1000);
        } catch (err) {
            console.error("Fehler beim Start:", err);
            this.stop();
        }
    }

    stop() {
        document.removeEventListener("dblclick", this.handleDoubleClick);
        document.removeEventListener("contextmenu", this.handleRightClick);
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

        const message = Utils.findInTree(instance, m => m?.baseMessage, { walkable: WALKABLE })?.baseMessage
            ?? Utils.findInTree(instance, m => m?.message, { walkable: WALKABLE })?.message;
        if (!message) return;

        const currentUser = this.CurrentUserStore?.getCurrentUser();
        if (!currentUser) return;

        const isOwn = message.author.id === currentUser.id;

        // Eigene Nachricht bearbeiten (immer aktiv)
        if (isOwn) {
            this.MessageStore?.startEditMessage?.(message.channel_id, message.id, message.content);
            return;
        }

        // Fremde Nachricht: Antworten (optional)
        if (!isOwn && this._settings.doubleClickToReply) {
            if (!this._settings.doubleClickToReplyModifier || this.checkForModifier(this._settings.replyModifier, e)) {
                const channel = this.getChannel?.(message.channel_id);
                if (channel) {
                    this.replyToMessage?.(channel, message, e);
                }
                return;
            }
        }
    };

    /* Rechtsklick-Handler */
    handleRightClick = (e) => {
        if (!this._settings.enableRightClickEdit) return;

        if (typeof e?.target?.className !== "string" ||
            IGNORE_CLASSES.some(cls => e.target.className?.includes(cls))) return;

        const messageDiv = e.target.closest('li > [class^=message]');
        if (!messageDiv || messageDiv.classList.contains(this.selectedClass)) return;

        const instance = ReactUtils.getInternalInstance(messageDiv);
        if (!instance) return;

        const message = Utils.findInTree(instance, m => m?.baseMessage, { walkable: WALKABLE })?.baseMessage
            ?? Utils.findInTree(instance, m => m?.message, { walkable: WALKABLE })?.message;
        if (!message) return;

        const currentUser = this.CurrentUserStore?.getCurrentUser();
        if (!currentUser) return;

        const isOwn = message.author.id === currentUser.id;

        // Nur für fremde Nachrichten
        if (!isOwn) {
            if (!this._settings.rightClickEditModifier || this.checkForModifier(this._settings.rightClickModifier, e)) {
                e.preventDefault();
                e.stopPropagation();
                const currentContent = this.localEdits.get(message.id) || message.content;
                this.openLocalEditModal(message, currentContent);
                return;
            }
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
        title.style.margin = '0';

        const subtitle = document.createElement('div');
        subtitle.innerText = "Diese Änderung ist nur für dich sichtbar und lokal gespeichert.";
        subtitle.style.cssText = "font-size:13px; color:#b9bbbe;";

        const textarea = document.createElement('textarea');
        textarea.value = currentContent;
        textarea.style.cssText = `
            width:100%; height:100px; background:#40444b; color:#fff; border:1px solid #202225; border-radius:4px;
            padding:10px; resize:vertical; font-family:inherit; font-size:15px; box-sizing:border-box;`;

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

            // Sicherstellen, dass UIModule existiert
            if (!this.UIModule) {
                return React.createElement('div', { 
                    style: { color: '#fff', padding: '16px' } 
                }, 'Fehler: UI-Module konnten nicht geladen werden.');
            }

            return React.createElement(React.Fragment, {},
                // Info-Bereich
                React.createElement('div', {
                    style: { 
                        background: '#2f3136', 
                        padding: '12px', 
                        borderRadius: '6px', 
                        marginBottom: '20px',
                        color: '#b9bbbe',
                        fontSize: '13px'
                    }
                }, [
                    React.createElement('div', { 
                        key: 'info1',
                        style: { marginBottom: '8px' }
                    }, '📝 Doppelklick auf EIGENE Nachrichten = Immer bearbeiten'),
                    React.createElement('div', { 
                        key: 'info2',
                        style: { marginBottom: '8px' }
                    }, '💬 Doppelklick auf FREMDE Nachrichten = Optional antworten'),
                    React.createElement('div', { 
                        key: 'info3'
                    }, '✏️ Rechtsklick auf FREMDE Nachrichten = Optional lokal bearbeiten')
                ]),

                // Antworten-Einstellungen
                React.createElement('div', {
                    style: { 
                        background: '#2f3136', 
                        padding: '16px', 
                        borderRadius: '6px', 
                        marginBottom: '16px' 
                    }
                }, [
                    React.createElement('h3', {
                        key: 'reply-title',
                        style: { color: '#fff', marginTop: '0', marginBottom: '12px', fontSize: '16px' }
                    }, '💬 Antworten auf fremde Nachrichten'),
                    
                    React.createElement(this.UIModule.FormSwitch, {
                        key: 'reply-switch',
                        value: settings.doubleClickToReply,
                        note: "Doppelklick auf fremde Nachrichten zum Antworten",
                        onChange: handleSwitch("doubleClickToReply")
                    }, "Doppelklick-Antworten aktivieren"),
                    
                    React.createElement(this.UIModule.FormSwitch, {
                        key: 'reply-mod-switch',
                        disabled: !settings.doubleClickToReply,
                        value: settings.doubleClickToReplyModifier,
                        note: "Antworten nur mit Modifikator-Taste",
                        onChange: handleSwitch("doubleClickToReplyModifier")
                    }, "Modifikator erforderlich"),
                    
                    React.createElement(this.UIModule.FormItem, {
                        key: 'reply-mod-item',
                        disabled: !settings.doubleClickToReply || !settings.doubleClickToReplyModifier,
                        title: "Modifikator-Taste für Antworten"
                    }, React.createElement(this.UIModule.RadioGroup, {
                        disabled: !settings.doubleClickToReply || !settings.doubleClickToReplyModifier,
                        value: settings.replyModifier,
                        options: [
                            { name: "Shift", value: "shift" },
                            { name: "Ctrl", value: "ctrl" },
                            { name: "Alt", value: "alt" }
                        ],
                        onChange: handleRadio("replyModifier")
                    }))
                ]),

                // Lokale Bearbeitung-Einstellungen
                React.createElement('div', {
                    style: { 
                        background: '#2f3136', 
                        padding: '16px', 
                        borderRadius: '6px', 
                        marginBottom: '16px' 
                    }
                }, [
                    React.createElement('h3', {
                        key: 'edit-title',
                        style: { color: '#fff', marginTop: '0', marginBottom: '12px', fontSize: '16px' }
                    }, '✏️ Lokale Bearbeitung fremder Nachrichten'),
                    
                    React.createElement(this.UIModule.FormSwitch, {
                        key: 'edit-switch',
                        value: settings.enableRightClickEdit,
                        note: "Rechtsklick auf fremde Nachrichten zum lokalen Bearbeiten",
                        onChange: handleSwitch("enableRightClickEdit")
                    }, "Rechtsklick-Bearbeitung aktivieren"),
                    
                    React.createElement(this.UIModule.FormSwitch, {
                        key: 'edit-mod-switch',
                        disabled: !settings.enableRightClickEdit,
                        value: settings.rightClickEditModifier,
                        note: "Lokale Bearbeitung nur mit Modifikator-Taste",
                        onChange: handleSwitch("rightClickEditModifier")
                    }, "Modifikator erforderlich"),
                    
                    React.createElement(this.UIModule.FormItem, {
                        key: 'edit-mod-item',
                        disabled: !settings.enableRightClickEdit || !settings.rightClickEditModifier,
                        title: "Modifikator-Taste für lokale Bearbeitung"
                    }, React.createElement(this.UIModule.RadioGroup, {
                        disabled: !settings.enableRightClickEdit || !settings.rightClickEditModifier,
                        value: settings.rightClickModifier,
                        options: [
                            { name: "Shift", value: "shift" },
                            { name: "Ctrl", value: "ctrl" },
                            { name: "Alt", value: "alt" }
                        ],
                        onChange: handleRadio("rightClickModifier")
                    }))
                ]),
                
                // Lokale Bearbeitungen verwalten
                React.createElement("button", {
                    onClick: () => {
                        this.localEdits.clear();
                        this.saveLocalEdits();
                        this.applyLocalEdits();
                    },
                    style: {
                        background: "#ed4245", color: "#fff", border: "none",
                        padding: "12px 20px", borderRadius: "6px", cursor: "pointer", 
                        fontSize: "14px", fontWeight: "600"
                    }
                }, "🗑️ Alle lokalen Bearbeitungen löschen")
            );
        };
    }
};
