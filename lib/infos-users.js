var events = require('events');

var InfosUsersModule = function (docID, coordinator, editor, network, usernameManager, serverDB) {
	var infosUsersModule = this;

	this.docID = docID;
	this.infosUsers = {};
	this.replicaNumber = -1;
	this.updateTimeout = null;
	this.readOnlyMode = false;
	this.offlineMode = true;

	this.coordinator = coordinator;
	
	// Coordinator provides the replicaNumber
	coordinator.once('replicaNumber', function (data) {
		infosUsersModule.replicaNumber = data.replicaNumber;
		infosUsersModule.infosUsers[data.replicaNumber] = {
			cursorIndex: 0,
			selections: [],
			username: 'User ' + data.replicaNumber
		};
	});

	// Coordinator signals the remote operations applied to the model
	coordinator.on('remoteOperations', function (data) {
		var operations = data.operations;

		infosUsersModule.applyRemoteOperations(operations);
	});

	this.editor = editor;

	editor.on('changeCursorAndSelections', function (data) {
		var cursorIndex = data.infosUser.cursorIndex;
		var selections = data.infosUser.selections;

		data.replicaNumber = infosUsersModule.replicaNumber;
		if(infosUsersModule.offlineMode === false) {
			infosUsersModule.emit('changeLocalCursorAndSelections', data);
		}
		infosUsersModule.updateCursorAndSelections(infosUsersModule.replicaNumber, cursorIndex, selections);
	});

	// Editor signals the changes made by the user to the document
	editor.on('localOperation', function (data) {
		var action = data.operation.action;
		var index = data.operation.index;
		var text = data.operation.text;

		infosUsersModule.applyLocalOperation(action, index, text);
	});

    editor.on('readOnlyModeOn', function () {
        infosUsersModule.readOnlyMode = true;
        infosUsersModule.emit('updateRemoteIndicators', { infosUsers: {} });
    });

    editor.on('readOnlyModeOff', function () {
        infosUsersModule.readOnlyMode = false;
        infosUsersModule.updateRemoteInfosUsers();
    });

	if(network !== null && network !== undefined) {
		this.network = network;

		var joinDoc = function (data) {
			var replicaNumber;
			var infosUser;

			for(replicaNumber in data.infosUsers) {
				infosUser = data.infosUsers[replicaNumber];
				infosUsersModule.infosUsers[replicaNumber] = {
					cursorIndex: infosUser.cursorIndex,
					selections: infosUser.selections,
					username: infosUser.username
				};
			}

			infosUsersModule.network.removeListener('receiveDoc', joinDoc);
			infosUsersModule.network.on('receiveDoc', reconnectToDoc);
		};

		var reconnectToDoc = function (data) {
			var replicaNumber;
			var infosUser = infosUsersModule.getLocalInfosUser();
			var temp = {};

			temp[infosUsersModule.replicaNumber] = {
				cursorIndex: infosUser.cursorIndex,
				selections: infosUser.selections,
				username: infosUser.username
			};

			for(replicaNumber in data.infosUsers) {
				if(parseInt(replicaNumber) !== parseInt(infosUsersModule.replicaNumber)) {
					infosUser = data.infosUsers[replicaNumber];
					temp[replicaNumber] = {
						cursorIndex: infosUser.cursorIndex,
						selections: infosUser.selections,
						username: infosUser.username
					};
				}
			}

			infosUsersModule.infosUsers = temp;
		};

		network.on('receiveDoc', joinDoc);

		network.on('receiveUserJoin', function (data) {
			var replicaNumber = data.replicaNumber;
			var username = data.username;

			infosUsersModule.emit('addCollaborator', data);
			infosUsersModule.addUser(replicaNumber, username);
			infosUsersModule.updateRemoteInfosUsers();
		});

		network.on('receiveUserLeft', function (data) {
			var replicaNumber = data.replicaNumber;

			infosUsersModule.emit('removeCollaborator', data);
			infosUsersModule.removeUser(replicaNumber);
			infosUsersModule.updateRemoteInfosUsers();
		});

		network.on('changeCollaboratorCursorAndSelections', function (data) {
			var replicaNumber = data.replicaNumber;
			var cursorIndex = data.infosUser.cursorIndex;
			var selections = data.infosUser.selections;

			infosUsersModule.updateCursorAndSelections(replicaNumber, cursorIndex, selections);
			infosUsersModule.updateRemoteInfosUsers();
		});
		/*
		network.on('changeCollaboratorUsername', function (data) {
			var replicaNumber = data.replicaNumber;
			var username = data.username;

			console.log('changeCollaboratorUsername');

			infosUsersModule.updateUsername(replicaNumber, username);
			infosUsersModule.updateRemoteInfosUsers();
		});
		*/
		/*
		this.usernameManager = usernameManager;

		usernameManager.on('changeUsername', function (data) {
			var username = data.username;

			data.replicaNumber = infosUsersModule.replicaNumber;
			infosUsersModule.emit('changeLocalUsername', data);
			infosUserModule.updateLocalUsername(username);
		});
		*/

	    network.on('connect', function () {
	        infosUsersModule.offlineMode = false;
	        infosUsersModule.updateRemoteInfosUsers();
	    });

	    network.on('disconnect', function () {
	        infosUsersModule.offlineMode = true;
	        infosUsersModule.emit('updateRemoteIndicators', { infosUsers: {} });
	        infosUsersModule.emit('updateCollaboratorsList', { infosUsers: {} });
	    });
	}
	
	this.serverDB = serverDB;
};

InfosUsersModule.prototype.__proto__ = events.EventEmitter.prototype;

InfosUsersModule.prototype.getLocalInfosUser = function () {
	return this.infosUsers[this.replicaNumber];
};

InfosUsersModule.prototype.updateCursorAndSelections = function (replicaNumber, cursorIndex, selections) {
	if(this.infosUsers[replicaNumber] !== null
		&& this.infosUsers[replicaNumber] !== undefined) {
		this.infosUsers[replicaNumber].cursorIndex = cursorIndex;
		this.infosUsers[replicaNumber].selections = selections;
	}
};

InfosUsersModule.prototype.applyLocalOperation = function (action, index, text) {
	var replicaNumber;
	var infosUser;

	for(replicaNumber in this.infosUsers) {
		infosUser = this.infosUsers[replicaNumber];
		// Since the 'changeCursorAndSelections' event will be triggered to update the user's infos
		// We just have to update the collaborators' ones
		if(parseInt(this.replicaNumber) !== parseInt(replicaNumber)) {
			if(index < infosUser.cursorIndex) {
				if(action === 'insertText') {
					infosUser.cursorIndex += text.length;
				}
				else if(action === 'removeText') {
					infosUser.cursorIndex -= text.length;
				}
			}

			for(i=0; i<infosUser.selections.length; i++) {
				selection = infosUser.selections[i];
				if(index < selection.start) {
					if(action === 'insertText') {
						selection.start += text.length;
					}
					else if(action === 'removeText') {
						selection.start -= text.length;
					}
				}

				if(index < selection.end) {
					if(action === 'insertText') {
						selection.end += text.length;
					}
					else if(action === 'removeText') {
						selection.end -= text.length;
					}
				}
			}
		}
	}
};

InfosUsersModule.prototype.applyRemoteOperations = function (operations) {
	var i, j;
	var operation;
	var replicaNumber;
	var diffCursor = 0;

	for(i=0; i<operations.length; i++) {
		operation = operations[i];
		
		if(operation.content !== undefined && operation.offset !== undefined && operation.content !== null && operation.offset !== null) {
			// Insertion
			diffCursor = operation.content.length;
		}
		else if(operation.length !== undefined && operation.length !== null && operation.offset !== undefined && operation.offset !== null) {
			// Deletion
			diffCursor = - operation.length;
		}

		for(replicaNumber in this.infosUsers) {
			if(parseInt(replicaNumber) !== parseInt(operation.owner)) {
				infosUser = this.infosUsers[replicaNumber];
				if(operation.offset < infosUser.cursorIndex) {
					infosUser.cursorIndex += diffCursor;
				}
				for(j=0; j<infosUser.selections.length; j++) {
					selection = infosUser.selections[j];
					if(operation.offset < selection.start) {
						selection.start += diffCursor;
					}
					if(operation.offset < selection.end) {
						selection.end += diffCursor;
					}
				}
			}
		}
	}
};

InfosUsersModule.prototype.updateRemoteInfosUsers = function () {
	var infosUsersModule = this;
	var replicaNumber;
	var infosUser;
	var temp = {};

	if(this.updateTimeout === null) {
		this.updateTimeout = setTimeout(function () {
			for(replicaNumber in infosUsersModule.infosUsers) {
				if(parseInt(replicaNumber) !== parseInt(infosUsersModule.replicaNumber) && parseInt(infosUsersModule.replicaNumber)>0) {
					infosUser = infosUsersModule.infosUsers[replicaNumber];
					temp[replicaNumber] = infosUser;
				}
			}
			if(infosUsersModule.readOnlyMode === false && infosUsersModule.offlineMode === false) {
				infosUsersModule.emit('updateRemoteIndicators', { infosUsers: temp });
			}
			if(infosUsersModule.offlineMode === false) {
				infosUsersModule.emit('updateCollaboratorsList', { infosUsers: temp });
			}
			infosUsersModule.updateTimeout = null;
		}, 100);
	};


};

InfosUsersModule.prototype.addUser = function (replicaNumber, username) {
	this.infosUsers[replicaNumber] = {
		username: username,
		cursorIndex: 0,
		selections: []
	};
};

InfosUsersModule.prototype.removeUser = function (replicaNumber) {
	delete this.infosUsers[replicaNumber];
};

InfosUsersModule.prototype.updateLocalUsername = function (username) {
	var infosUsersModule = this;

	this.serverDB.models.query()
	.filter('docID', this.docID)
	.modify({ username: username })
	.execute()
	.done(function (results) {
		infosUsersModule.infosUsers[replicaNumber].username = username;
	});
};

InfosUsersModule.prototype.updateUsername = function (replicaNumber, username) {
	if(this.infosUsers[replicaNumber] !== null
		&& this.infosUsers[replicaNumber] !== undefined) {
		this.infosUsers[replicaNumber].username = username;
	}
};

module.exports = InfosUsersModule;