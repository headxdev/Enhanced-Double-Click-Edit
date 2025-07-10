/**
 * @name Enhanced Double Click To Edit
 * @author YourUsername
 * @version 1.0.0
 * @description Double click any message to edit it locally (visual changes only for you). Your own messages can be edited normally.
 * 
 * @invite your_invite_code
 * @website https://github.com/YourUsername/DiscordPlugins/
 * @source https://github.com/YourUsername/DiscordPlugins/blob/master/Enhanced-Double-Click-Edit/EnhancedDoubleClickEdit.plugin.js
 * @updateUrl https://raw.githubusercontent.com/YourUsername/DiscordPlugins/master/Enhanced-Double-Click-Edit/EnhancedDoubleClickEdit.plugin.js
 */

/** @type {typeof import("react")} */
const React = BdApi.React,

	{ Webpack, Webpack: { Filters }, Data, Utils, ReactUtils } = BdApi,

	config = {},

	ignore = [
		//Object
		"video",
		"emoji",
		//Classes
		"content",
		"reactionInner"
	],
	walkable = [
		"child",
		"memoizedProps",
		"sibling"
	];


module.exports = class EnhancedDoubleClickToEdit {

	constructor(meta) { 
		config.info = meta; 
		this.localEdits = new Map(); // Store local edits
	}

	start() {
		try {
			//Classes
			this.selectedClass = Webpack.getModule(Filters.byKeys("message", "selected")).selected;
			this.messagesWrapper = Webpack.getModule(Filters.byKeys("empty", "messagesWrapper")).messagesWrapper;

			//Copy to clipboard
			this.copyToClipboard = Webpack.getModule(Filters.byKeys("clipboard", "app")).clipboard.copy;

			//Reply functions
			this.replyToMessage = Webpack.getModule(m => m?.toString?.()?.replace('\n', '')?.search(/(channel:e,message:n,shouldMention:!)/) > -1, { searchExports: true })
			this.getChannel = Webpack.getModule(Filters.byKeys("getChannel", "getDMFromUserId")).getChannel;

			//Stores
			this.MessageStore = Webpack.getModule(Filters.byKeys("receiveMessage", "editMessage"));
			this.CurrentUserStore = Webpack.getModule(Filters.byKeys("getCurrentUser"));

			//Settings
			this.UIModule = Webpack.getModule(m => m.FormItem && m.RadioGroup);

			//Events
			global.document.addEventListener('dblclick', this.doubleclickFunc);

			//Load settings
			//Edit
			this.doubleClickToEditModifier = Data.load(config.info.slug, "doubleClickToEditModifier") ?? false;
			this.editModifier = Data.load(config.info.slug, "editModifier") ?? "shift";
			//Reply
			this.doubleClickToReply = Data.load(config.info.slug, "doubleClickToReply") ?? false;
			this.doubleClickToReplyModifier = Data.load(config.info.slug, "doubleClickToReplyModifier") ?? false;
			this.replyModifier = Data.load(config.info.slug, "replyModifier") ?? "shift";
			//Copy
			this.doubleClickToCopy = Data.load(config.info.slug, "doubleClickToCopy") ?? false;
			this.copyModifier = Data.load(config.info.slug, "copyModifier") ?? "shift";
			//Local Edit
			this.enableLocalEdit = Data.load(config.info.slug, "enableLocalEdit") ?? true;
			this.localEditModifier = Data.load(config.info.slug, "localEditModifier") ?? "alt";

			//Load stored local edits
			this.loadLocalEdits();

			//Apply local edits on load
			setTimeout(() => this.applyLocalEdits(), 1000);

		}
		catch (err) {
			try {
				console.error("Attempting to stop after starting error...", err);
				this.stop();
			}
			catch (err) {
				console.error(config.info.name + ".stop()", err);
			}
		}
	}

	//By doing this we make sure we're able to remove our event
	//otherwise it gets stuck on the page and never actually unloads.
	doubleclickFunc = (e) => this.handler(e);

	stop = () => {
		document.removeEventListener('dblclick', this.doubleclickFunc);
		this.saveLocalEdits();
	};

	loadLocalEdits() {
		const stored = Data.load(config.info.slug, "localEdits");
		if (stored) {
			this.localEdits = new Map(Object.entries(stored));
		}
	}

	saveLocalEdits() {
		const editsObject = Object.fromEntries(this.localEdits);
		Data.save(config.info.slug, "localEdits", editsObject);
	}

	applyLocalEdits() {
		// Apply all stored local edits to visible messages
		const messages = document.querySelectorAll('[class^="message"]');
		messages.forEach(messageElement => {
			const instance = ReactUtils.getInternalInstance(messageElement);
			if (!instance) return;

			const message = Utils.findInTree(instance, m => m?.baseMessage, { walkable: walkable })?.baseMessage ??
				Utils.findInTree(instance, m => m?.message, { walkable: walkable })?.message;

			if (message && this.localEdits.has(message.id)) {
				this.applyLocalEditToMessage(messageElement, this.localEdits.get(message.id));
			}
		});
	}

	applyLocalEditToMessage(messageElement, newContent) {
		const contentElement = messageElement.querySelector('[class*="messageContent"]');
		if (contentElement) {
			// Store original content if not already stored
			if (!contentElement.dataset.originalContent) {
				contentElement.dataset.originalContent = contentElement.textContent;
			}
			
			// Apply local edit with visual indicator
			contentElement.textContent = newContent;
			contentElement.style.backgroundColor = 'rgba(255, 255, 0, 0.1)';
			contentElement.style.border = '1px solid rgba(255, 255, 0, 0.3)';
			contentElement.style.borderRadius = '3px';
			contentElement.title = 'Lokal bearbeitet (nur für Sie sichtbar)';
		}
	}

	createLocalEditModal(message, currentContent) {
		const modal = document.createElement('div');
		modal.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background: rgba(0, 0, 0, 0.8);
			display: flex;
			justify-content: center;
			align-items: center;
			z-index: 10000;
		`;

		const modalContent = document.createElement('div');
		modalContent.style.cssText = `
			background: #36393f;
			padding: 20px;
			border-radius: 8px;
			width: 500px;
			max-width: 90%;
			color: white;
		`;

		const title = document.createElement('h3');
		title.textContent = 'Nachricht lokal bearbeiten';
		title.style.marginBottom = '15px';

		const subtitle = document.createElement('p');
		subtitle.textContent = 'Diese Änderung ist nur für Sie sichtbar und wird lokal gespeichert.';
		subtitle.style.fontSize = '12px';
		subtitle.style.color = '#b9bbbe';
		subtitle.style.marginBottom = '15px';

		const textarea = document.createElement('textarea');
		textarea.value = currentContent;
		textarea.style.cssText = `
			width: 100%;
			height: 100px;
			background: #40444b;
			border: 1px solid #202225;
			color: white;
			padding: 10px;
			border-radius: 4px;
			resize: vertical;
			font-family: inherit;
			margin-bottom: 15px;
		`;

		const buttonContainer = document.createElement('div');
		buttonContainer.style.cssText = `
			display: flex;
			gap: 10px;
			justify-content: flex-end;
		`;

		const saveButton = document.createElement('button');
		saveButton.textContent = 'Speichern';
		saveButton.style.cssText = `
			background: #5865f2;
			color: white;
			border: none;
			padding: 8px 16px;
			border-radius: 4px;
			cursor: pointer;
		`;

		const cancelButton = document.createElement('button');
		cancelButton.textContent = 'Abbrechen';
		cancelButton.style.cssText = `
			background: #4f545c;
			color: white;
			border: none;
			padding: 8px 16px;
			border-radius: 4px;
			cursor: pointer;
		`;

		const deleteButton = document.createElement('button');
		deleteButton.textContent = 'Lokale Bearbeitung löschen';
		deleteButton.style.cssText = `
			background: #ed4245;
			color: white;
			border: none;
			padding: 8px 16px;
			border-radius: 4px;
			cursor: pointer;
			margin-right: auto;
		`;

		saveButton.onclick = () => {
			const newContent = textarea.value.trim();
			if (newContent !== currentContent) {
				this.localEdits.set(message.id, newContent);
				this.saveLocalEdits();
				this.applyLocalEdits();
			}
			document.body.removeChild(modal);
		};

		cancelButton.onclick = () => {
			document.body.removeChild(modal);
		};

		deleteButton.onclick = () => {
			this.localEdits.delete(message.id);
			this.saveLocalEdits();
			this.applyLocalEdits();
			document.body.removeChild(modal);
		};

		// Show delete button only if there's a local edit
		if (this.localEdits.has(message.id)) {
			buttonContainer.appendChild(deleteButton);
		}

		buttonContainer.appendChild(cancelButton);
		buttonContainer.appendChild(saveButton);

		modalContent.appendChild(title);
		modalContent.appendChild(subtitle);
		modalContent.appendChild(textarea);
		modalContent.appendChild(buttonContainer);
		modal.appendChild(modalContent);

		document.body.appendChild(modal);
		textarea.focus();
		textarea.select();
	}

	getSettingsPanel() {
		return () => {
			//Edit
			const [editEnableModifier, setEditEnableModifier] = React.useState(this.doubleClickToEditModifier),
				[editModifier, setEditModifier] = React.useState(this.editModifier),
				//Reply
				[reply, setReply] = React.useState(this.doubleClickToReply),
				[replyEnableModifier, setReplyEnableModifier] = React.useState(this.doubleClickToReplyModifier),
				[replyModifier, setReplyModifier] = React.useState(this.replyModifier),
				//Copy
				[copy, setCopy] = React.useState(this.doubleClickToCopy),
				[copyModifier, setCopyModifier] = React.useState(this.copyModifier),
				//Local Edit
				[localEdit, setLocalEdit] = React.useState(this.enableLocalEdit),
				[localEditModifier, setLocalEditModifier] = React.useState(this.localEditModifier);

			return [
				//Edit
				React.createElement(this.UIModule.FormSwitch, {
					value: editEnableModifier,
					note: "Aktiviere Modifikator für Doppelklick zum Bearbeiten",
					onChange: (newState) => {
						this.doubleClickToEditModifier = newState;
						Data.save(config.info.slug, "doubleClickToEditModifier", newState);
						setEditEnableModifier(newState);
					}
				}, "Bearbeiten-Modifikator aktivieren"),
				React.createElement(this.UIModule.FormItem, {
					disabled: !editEnableModifier,
					title: "Modifikator zum Bearbeiten eigener Nachrichten"
				},
					React.createElement(this.UIModule.RadioGroup, {
						disabled: !editEnableModifier,
						value: editModifier,
						options: [
							{ name: "Shift", value: "shift" },
							{ name: "Ctrl", value: "ctrl" },
							{ name: "Alt", value: "alt" }
						],
						onChange: (newState) => {
							this.editModifier = newState.value;
							Data.save(config.info.slug, "editModifier", newState.value);
							setEditModifier(newState.value);
						}
					})),

				//Local Edit
				React.createElement(this.UIModule.FormSwitch, {
					value: localEdit,
					note: "Erlaube lokale Bearbeitung aller Nachrichten (nur für Sie sichtbar)",
					onChange: (newState) => {
						this.enableLocalEdit = newState;
						Data.save(config.info.slug, "enableLocalEdit", newState);
						setLocalEdit(newState);
					}
				}, "Lokale Bearbeitung aktivieren"),
				React.createElement(this.UIModule.FormItem, {
					disabled: !localEdit,
					title: "Modifikator für lokale Bearbeitung"
				},
					React.createElement(this.UIModule.RadioGroup, {
						disabled: !localEdit,
						value: localEditModifier,
						options: [
							{ name: "Shift", value: "shift" },
							{ name: "Ctrl", value: "ctrl" },
							{ name: "Alt", value: "alt" }
						],
						onChange: (newState) => {
							this.localEditModifier = newState.value;
							Data.save(config.info.slug, "localEditModifier", newState.value);
							setLocalEditModifier(newState.value);
						}
					})),

				//Reply
				React.createElement(this.UIModule.FormSwitch, {
					value: reply,
					note: "Doppelklick auf Nachrichten anderer zum Antworten",
					onChange: (newState) => {
						this.doubleClickToReply = newState;
						Data.save(config.info.slug, "doubleClickToReply", newState);
						setReply(newState);
					}
				}, "Antworten aktivieren"),
				React.createElement(this.UIModule.FormSwitch, {
					disabled: !reply,
					value: replyEnableModifier,
					note: "Aktiviere Modifikator für Doppelklick zum Antworten",
					onChange: (newState) => {
						this.doubleClickToReplyModifier = newState;
						Data.save(config.info.slug, "doubleClickToReplyModifier", newState);
						setReplyEnableModifier(newState);
					}
				}, "Antworten-Modifikator aktivieren"),
				React.createElement(this.UIModule.FormItem, {
					disabled: (!reply || !replyEnableModifier),
					title: "Modifikator zum Antworten auf Nachrichten"
				},
					React.createElement(this.UIModule.RadioGroup, {
						disabled: (!reply || !replyEnableModifier),
						value: replyModifier,
						options: [
							{ name: "Shift", value: "shift" },
							{ name: "Ctrl", value: "ctrl" },
							{ name: "Alt", value: "alt" }
						],
						onChange: (newState) => {
							this.replyModifier = newState.value;
							Data.save(config.info.slug, "replyModifier", newState.value);
							setReplyModifier(newState.value);
						}
					})),

				//Copy
				React.createElement(this.UIModule.FormSwitch, {
					value: copy,
					note: "Kopiere Auswahl vor dem Bearbeiten",
					onChange: (newState) => {
						this.doubleClickToCopy = newState;
						Data.save(config.info.slug, "doubleClickToCopy", newState);
						setCopy(newState);
					}
				}, "Kopieren aktivieren"),
				React.createElement(this.UIModule.FormItem, {
					disabled: !copy,
					title: "Modifikator zum Kopieren von Text"
				},
					React.createElement(this.UIModule.RadioGroup, {
						disabled: !copy,
						value: copyModifier,
						options: [
							{ name: "Shift", value: "shift" },
							{ name: "Ctrl", value: "ctrl" },
							{ name: "Alt", value: "alt" }
						],
						onChange: (newState) => {
							this.copyModifier = newState.value;
							Data.save(config.info.slug, "copyModifier", newState.value);
							setCopyModifier(newState.value);
						}
					})),

				// Clear local edits button
				React.createElement('button', {
					onClick: () => {
						this.localEdits.clear();
						this.saveLocalEdits();
						this.applyLocalEdits();
					},
					style: {
						background: '#ed4245',
						color: 'white',
						border: 'none',
						padding: '8px 16px',
						borderRadius: '4px',
						cursor: 'pointer',
						marginTop: '10px'
					}
				}, 'Alle lokalen Bearbeitungen löschen')
			];
		}
	}

	handler(e) {
		//Check if we're not double clicking
		if (typeof (e?.target?.className) !== typeof ("") ||
			ignore.some(nameOfClass => e?.target?.className?.indexOf?.(nameOfClass) > -1))
			return;

		//Target the message
		const messageDiv = e.target.closest('li > [class^=message]');

		//If it finds nothing, null it.
		if (!messageDiv)
			return;
		//Make sure we're not resetting when the message is already in edit-mode.
		if (messageDiv.classList.contains(this.selectedClass))
			return;

		//Basically make a HTMLElement/Node interactable with it's React components.
		const instance = ReactUtils.getInternalInstance(messageDiv);
		//Mandatory nullcheck
		if (!instance)
			return;

		//When selecting text it might be useful to copy.
		const copyKeyHeld = this.checkForModifier(this.doubleClickToCopy, this.copyModifier, e);
		if (copyKeyHeld)
			this.copyToClipboard(document.getSelection().toString());

		//The message instance is filled top to bottom, as it is in view.
		//As a result, "baseMessage" will be the actual message you want to address. And "message" will be the reply.
		//Maybe the message has a reply, so check if "baseMessage" exists and otherwise fallback on "message".
		const message = Utils.findInTree(instance, m => m?.baseMessage, { walkable: walkable })?.baseMessage ??
			Utils.findInTree(instance, m => m?.message, { walkable: walkable })?.message;

		if (!message)
			return;

		//Check for modifier keys
		const editKeyHeld = this.checkForModifier(this.doubleClickToEditModifier, this.editModifier, e),
			replyKeyHeld = this.checkForModifier(this.doubleClickToReplyModifier, this.replyModifier, e),
			localEditKeyHeld = this.checkForModifier(true, this.localEditModifier, e);

		//Check if this is the current user's message
		const isOwnMessage = message.author.id === this.CurrentUserStore.getCurrentUser().id;

		//Handle local editing for any message
		if (this.enableLocalEdit && localEditKeyHeld) {
			const currentContent = this.localEdits.get(message.id) || message.content;
			this.createLocalEditModal(message, currentContent);
			return;
		}

		//Handle normal editing for own messages
		if (isOwnMessage && (this.doubleClickToEditModifier ? editKeyHeld : true)) {
			this.MessageStore.startEditMessage(message.channel_id, message.id, message.content);
		}
		//Handle replying to other messages
		else if (!isOwnMessage && (this.doubleClickToReplyModifier ? replyKeyHeld : true) && this.doubleClickToReply) {
			this.replyToMessage(this.getChannel(message.channel_id), message, e);
		}
		//Handle local editing when no modifier is required
		else if (this.enableLocalEdit && !isOwnMessage && !this.doubleClickToReplyModifier) {
			const currentContent = this.localEdits.get(message.id) || message.content;
			this.createLocalEditModal(message, currentContent);
		}
	}

	/**
	 * 
	 * @param {boolean} enabled Is the modifier enabled
	 * @param {string} modifier Modifier key to be checked for
	 * @param {Event} event The event checked against
	 * @returns {boolean} Whether the modifier is enabled and the modifier is pressed
	 */
	checkForModifier(enabled, modifier, event) {
		if (enabled)
			switch (modifier) {
				case "shift": return event.shiftKey;
				case "ctrl": return event.ctrlKey;
				case "alt": return event.altKey;
			}
		return false;
	}
}