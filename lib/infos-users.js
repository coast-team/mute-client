var events = require('events');

var InfosUsersModule = function (docID, coordinator, editor, network, usernameManager, serverDB) {
    var infosUsersModule = this;

    this.docID = docID;
    this.infosUsers = {
        '-1': {
            cursorIndex: 0,
            selections: [],
            username: 'Unknown user'
        }
    };
    this.replicaNumber = -1;
    this.updateTimeout = null;
    this.readOnlyMode = false;
    this.offlineMode = true;
    this.disposed = false;

    this.coordinator = coordinator;

    // Coordinator signals the remote operations applied to the model
    coordinator.on('remoteOperations', function (data) {
        var operations;
        if(infosUsersModule.disposed === false) {
            operations = data.operations;
            infosUsersModule.applyRemoteOperations(operations);
        }
    });

    coordinator.on('coordinatorDisposed', function () {
        //infosUsersModule.coordinator = null;
        if(infosUsersModule.disposed === false) {
            infosUsersModule.onCoordinatorDisposedHandler();
        }
    });

    this.editor = editor;

    editor.on('changeCursorAndSelections', function (data) {
        if(infosUsersModule.disposed === false) {
            var cursorIndex = data.infosUser.cursorIndex;
            var selections = data.infosUser.selections;

            data.replicaNumber = infosUsersModule.replicaNumber;
            if(infosUsersModule.offlineMode === false) {
                infosUsersModule.emit('changeLocalCursorAndSelections', data);
            }
            infosUsersModule.updateCursorAndSelections(infosUsersModule.replicaNumber, cursorIndex, selections);
        }
    });

    // Editor signals the changes made by the user to the document
    editor.on('localOperation', function (data) {
        var action;
        var index;
        var text;
        if(infosUsersModule.disposed === false) {
            action = data.operation.action;
            index = data.operation.index;
            text = data.operation.text;
            infosUsersModule.applyLocalOperation(action, index, text);
        }
    });

    editor.on('readOnlyModeOn', function () {
        if(infosUsersModule.disposed === false) {
            infosUsersModule.readOnlyMode = true;
            infosUsersModule.emit('updateRemoteIndicators', { infosUsers: {} });
        }
    });

    editor.on('readOnlyModeOff', function () {
        if(infosUsersModule.disposed === false) {
            infosUsersModule.readOnlyMode = false;
            infosUsersModule.updateRemoteInfosUsers();
        }
    });

    if(network !== null && network !== undefined) {
        this.network = network;

        var joinDoc = function (data) {
            var replicaNumber;
            var infosUser;

            infosUsersModule.replicaNumber = data.replicaNumber;
            delete infosUsersModule.infosUsers['-1'];

            for(replicaNumber in data.infosUsers) {
                infosUser = data.infosUsers[replicaNumber];
                infosUsersModule.infosUsers[replicaNumber] = {
                    cursorIndex: infosUser.cursorIndex,
                    selections: infosUser.selections,
                    username: infosUser.username
                };
            }

            infosUsersModule.updateLocalUsername(infosUsersModule.infosUsers[infosUsersModule.replicaNumber].username);

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

        //network.on('receiveDoc', joinDoc);
        network.on('receiveDocPeer', joinDoc);
        network.on('addUser', function(replicaNumber, username){
            infosUsersModule.addUser(replicaNumber, username);
        });

        network.on('removeUser', function(replicaNumber){
            console.log("removeUser");
            console.log(replicaNumber);
            infosUsersModule.removeUser(replicaNumber);
        });

        network.on('receiveUserJoin', function (data) {
            console.log('receiveUserJoin');
            console.log(data);
            if(infosUsersModule.disposed === false) {
                var replicaNumber = data.replicaNumber;
                var username = data.username;

                infosUsersModule.emit('addCollaborator', data);
                infosUsersModule.addUser(replicaNumber, username);
                infosUsersModule.updateRemoteInfosUsers();
            }
        });

        network.on('receiveUserLeft', function (data) {
            var replicaNumber = data.replicaNumber;
            if(infosUsersModule.disposed === false) {
                infosUsersModule.emit('removeCollaborator', data);
                infosUsersModule.removeUser(replicaNumber);
                infosUsersModule.updateRemoteInfosUsers();
            }
        });

        network.on('changeCollaboratorCursorAndSelections', function (data) {
            var replicaNumber = data.replicaNumber;
            var cursorIndex = data.infosUser.cursorIndex;
            var selections = data.infosUser.selections;

            if(infosUsersModule.disposed === false) {
                infosUsersModule.updateCursorAndSelections(replicaNumber, cursorIndex, selections);
                infosUsersModule.updateRemoteInfosUsers();
            }
        });
        
        network.on('changeCollaboratorUsername', function (data) {
            var replicaNumber = data.replicaNumber;
            var username = data.username;

            if(infosUsersModule.disposed === false) {
                infosUsersModule.updateUsername(replicaNumber, username);
                infosUsersModule.updateRemoteInfosUsers();
            }
        });

        network.on('connect', function () {
            if(infosUsersModule.disposed === false) {
                infosUsersModule.offlineMode = false;
                infosUsersModule.updateRemoteInfosUsers();
            }
        });

        network.on('disconnect', function () {
            if(infosUsersModule.disposed === false) {
                infosUsersModule.offlineMode = true;
                infosUsersModule.emit('updateRemoteIndicators', { infosUsers: {} });
                infosUsersModule.emit('updateCollaboratorsList', { infosUsers: {} });
            }
        });

        network.on('networkDisposed', function () {
            if(infosUsersModule.disposed === false) {
                infosUsersModule.network = null;
            }
        });
    }

    this.serverDB = serverDB;

    this.initUsername();
};

InfosUsersModule.prototype.__proto__ = events.EventEmitter.prototype;

InfosUsersModule.prototype.initUsername = function () {
    var infosUsersModule = this;
    var username = null;

    this.serverDB.models.query()
    .filter('docID', this.docID)
    .execute()
    .done(function (results) {
        if(results.length > 0) {
            username = results[0].username;
        }
        infosUsersModule.updateLocalUsername(username);
    });
};

InfosUsersModule.prototype.getLocalInfosUser = function () {
    return this.infosUsers[this.replicaNumber];
};

InfosUsersModule.prototype.getUsername = function () {
    return this.infosUsers[this.replicaNumber].username;
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
    console.log("BIM BADA BOUM !!");
    this.infosUsers[replicaNumber] = {
        username: username,
        cursorIndex: 0,
        selections: []
    };
};

InfosUsersModule.prototype.removeUser = function (replicaNumber) {
    if(parseInt(this.replicaNumber) !== parseInt(replicaNumber)) {
        delete this.infosUsers[replicaNumber];
    }   
};

InfosUsersModule.prototype.updateLocalUsername = function (username) {
    var infosUsersModule = this;
    this.serverDB.models.query()
    .filter('docID', this.docID)
    .modify({ username: username })
    .execute()
    .done(function (results) {
        infosUsersModule.infosUsers[infosUsersModule.replicaNumber].username = username;
        infosUsersModule.emit('changeLocalUsername', { replicaNumber: infosUsersModule.replicaNumber, username: username });
    });
};

InfosUsersModule.prototype.updateUsername = function (replicaNumber, username) {
    if(this.infosUsers[replicaNumber] !== null
        && this.infosUsers[replicaNumber] !== undefined) {
        this.infosUsers[replicaNumber].username = username;
    }
};

InfosUsersModule.prototype.onCoordinatorDisposedHandler = function () {
    var key;

    this.emit('infosUsersModuleDisposed');

    for(key in this) {
        if(this.hasOwnProperty(key) === true) {
            if(key === 'disposed') {
                this.disposed = true;
            }
            else {
                this[key] = null;
            }
        }
    }
};

module.exports = InfosUsersModule;