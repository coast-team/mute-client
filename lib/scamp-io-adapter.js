var events = require('events');

var HOP = 7;
/*
Useful functions
 */

function makeTag(replicaNumber, clock){
    return replicaNumber + ':' + clock;
}

function isEqualTag(tag1, tag2){
    if(tag1 === tag2 && tag1 !== null && tag1 !== undefined && tag2 !== null && tag2 !== undefined){
        return true;
    }else{
        return false;
    }
}

var PeerInfo = function(replicaNumber, connection){
    this.replicaNumber = replicaNumber;
    this.connection = connection || null;
};

var Message = function(replicaNumber, clock, context, data, srcPeerId, hop){
    console.log('MESSAGE');
    console.log(context);
    this.hop = hop || HOP;
    this.tag = makeTag(replicaNumber, clock);
    this.event = context;
    this.data = data;
    this.srcPeerId = srcPeerId; //peerID of emitter
};

Message.prototype.decreaseHop = function () {
    console.log('decreas hop');
  if(this.hop > 0){
    this.hop --;
  }
};

var SCAMP = function(peerIOAdapter, offerRecipients){
    var self = this;
    this.safe = 0;
    this.peers = []; //partial view
    this.pendingList = []; //pendingList waiting for response
    this.offerRecipients = offerRecipients;
    this.peerIOAdapter = peerIOAdapter;
    this.clock = 0;
    this.firstConnection = true;
    this.onNetworkMsg = {}; //All msg, send and received

    this.peerIOAdapter.on('launch', function(data){
        //TODO
    });

    this.peerIOAdapter.on('infoServer', function(data){
        //TODO
    });

    this.peerIOAdapter.on('infoUser', function(data){
        //TODO
    });

    this.peerIOAdapter.on('send', function(data){
        console.log('send');
        self.broadcastMsg(data);
    });

    this.peerIOAdapter.on('giveDoc', function(data){
            console.log('giveDoc');
            console.log(data);
            var remoteConnection = self.getConnectionFromPeersList(data.peerId);
            console.log(remoteConnection);
            self.send(data.msg, 'giveDoc',remoteConnection);
    });

};

SCAMP.prototype.__proto__ = events.EventEmitter.prototype;

SCAMP.prototype.init = function(){
    var self = this;

    if(this.firstConnection){
        this.firstConnection = false;
        this.makeOffer();
    }

    this.peerIOAdapter.peer.on('connection', function(connection){
        console.log('New connection :-)');
        self.initConnection(connection);
    });

};

//Get remonte connection already saved in pending list
//And remove it from pendingList

SCAMP.prototype.createConnection = function(peerId, callback, args){
    console.log('New connection');
    var self = this;

    var connection = this.peerIOAdapter.peer.connect(peerId);
    console.log(connection);
    connection.on('open', function(){
        console.log('connection is opened');
        self.initConnection(connection);
        if(callback !== null && callback !== undefined){
            callback.apply(this, args);
        }
    });
};

SCAMP.prototype.initConnection = function(connection){
    console.log('initConnection');
    console.log(this);
    var self = this;
    if(!self.isAlreadyInPeersList(connection.peer) && !self.isAlreadyInPendingList(connection.peer)){
        console.log('OK !!');
        this.pendingList.push(connection);
        connection.on('data', handleMsg); // data receiving
        connection.on('close', function(){
            console.log('close connection');
            //connection closing
            var replicaNumber = self.getReplicaNumber(connection.peer);
            //self.peerIOAdapter.emit('removeUser', replicaNumber);
            console.log(replicaNumber);
            self.refreshOfferRecipients();
            this.close();
            var index = self.peers.indexOf(this);
            self.peers.splice(index, 1);
        });
    }


    function handleMsg(arg){
        console.log('handle msg');
        console.log(arg);
        try{
            var msg = JSON.parse(arg);
            console.log(msg.event);
        }catch(e){
            console.log("Not a valid JSON");
            console.log(msg);
            return;
        }
        if(msg.event !== null && msg.event !== undefined && !self.isKnownMsg(msg)){
            console.log('passe le test');
            self.pushMsg(msg);
            switch(msg.event){
                case 'offer':
                    console.log('offer');
                    self.forwardOffer(msg);
                    break;
                case 'broadcast':
                    self.receiveOp(msg);
                    break;
                case 'accept':
                    self.onOfferAccepted(msg);
                    break;
                case 'giveDoc':
                    self.receiveDoc(msg)
                    console.log('TOTO !!!!');
                    break;

                case 'removeUser':
                    break;
                case 'broadcastInfoUser':
                    break;
                default :
                    console.log("ERREUR SCAMP received undefined context");
                    break;
            }
        }
    }
}

SCAMP.prototype.receiveOp = function(msg){
    console.log('receiveOp');
    console.log(msg);
    this.emit('receiveOp', msg.data);
    this.forwardBroadcast(msg);

}

SCAMP.prototype.receiveDoc = function(msg){
    this.emit('receiveDoc', msg.data);
};

SCAMP.prototype.getConnectionFromPendingList = function(peerId){
    for(var i = 0; i < this.pendingList.length; i++){
        if(this.pendingList[i].peer === peerId){
            var res = this.pendingList[i];
            this.pendingList.splice(i,1);
            return res;
        }
    }
    return null;
};

SCAMP.prototype.getConnectionFromPeersList = function(peerId){
    for(var i = 0; i < this.peers.length; i++){
        if(this.peers[i].peerId === peerId){
            return this.peers[i].connection;
        }
    }
    return null;
};


SCAMP.prototype.isAlreadyInPartialView = function(replicaNumber){
    console.log('isAlreadyInPartialView');
    console.log(this.peers);
    for (var i = 0; i < this.peers.length; i++) {
        if(this.peers[i].peerInfo.replicaNumber === replicaNumber){
            console.log('true');
            return true;
        }
    }
    console.log('false');
    return false;
};

SCAMP.prototype.isAlreadyInPendingList = function (peerId) {
    console.log('isAlreadyInPendingList');
    for (var i = 0; i < this.pendingList.length; i++) {
        if(this.pendingList[i].peer == peerId){
            console.log('true');
            return true;
        }
    }
    console.log('false');
    return false;
};

SCAMP.prototype.isAlreadyInPeersList = function (peerId) {
    console.log('isAlreadyInPeersList');
    for (var i = 0; i < this.peers.length; i++) {
        if(this.peers[i].peerId == peerId){
            console.log('true');
            return true;
        }
    }
    console.log('false');
    return false;
};

/*
for a given peerId, returns the replica number of the right peer
*/

SCAMP.prototype.getReplicaNumber = function(peerId){
    console.log('get replicanumber');
    for (var i = 0; i < this.peers.length; i++) {
        if(this.peers[i].connection.peer === peerId){
            console.log('find');
            console.log(this.peers[i]);
            return this.peers[i].replicaNumber;
        }
    }
    return null;
};


SCAMP.prototype.makeOffer = function(index){
    console.log('MAKE OFFER');
    //Création d'un peerInfo avec le replicanumber et tout...
    var self = this;

    var peerInfo = new PeerInfo(this.peerIOAdapter.replicaNumber);
    //InfoUser + peerInfo
    var data = {
        peerId : this.peerIOAdapter.peer.id,
        username : this.peerIOAdapter.username,
        peerInfo : peerInfo
    };

    var msg = JSON.stringify(new Message(this.peerIOAdapter.replicaNumber, this.clock, "offer", data, this.peerIOAdapter.peer.id));
    // var msg = new Message(this.peerIOAdapter.replicaNumber, this.clock, 'offer', null, this.peerIOAdapter.peer.id);

    if(index === null || index === undefined){
        if(this.offerRecipients.length > 0){
            this.clock ++;
        }

        function sendMsg(remoteId, msg){

            var callback = function(msg){
                console.log('SEND');
                console.log(msg);
                this.send(msg);
            }
            args = new Array(msg);
            self.createConnection(remoteId, callback, args);
        }

        for (var i = 0; i < this.offerRecipients.length; i++) {
            sendMsg(this.offerRecipients[i], msg);
        }

    }else{
        this.clock ++;
        this.peers[index].connection.send(msg);

    }


};

SCAMP.prototype.onOfferAccepted = function(msg){
    console.log('on Offer accepted');
    console.log('wiiiii');
    console.log(msg);
    var remoteConnection = this.getConnectionFromPendingList(msg.srcPeerId);
    console.log('toto');
    console.log(remoteConnection);
    if(msg.data !== null && msg.data !== undefined && remoteConnection !== null && remoteConnection !== undefined){
        console.log('Add User');
        this.peerIOAdapter.emit('addUser', msg.data.peerInfo.replicaNumber, msg.data.username);
        var remotePeerInfo = msg.data;
        remotePeerInfo.connection = remoteConnection;
        this.peers.push(remotePeerInfo);
    }
};

SCAMP.prototype.acceptOffer = function(msg){
    console.log('accept offer');
    console.log(msg);



    var callback = function(self){
        var remotePeerInfo = msg.data;
        var peerInfo = new PeerInfo(self.peerIOAdapter.replicaNumber); //PeerInfo of current node
        var data = {
            peerId : self.peerIOAdapter.peer.id,
            username : self.peerIOAdapter.username,
            peerInfo : peerInfo
        };
        console.log('Callback accept offer');
        console.log(data);
        var remoteConnection = self.getConnectionFromPendingList(msg.srcPeerId);
        console.log('hey !!!');
        console.log(remoteConnection);
        remotePeerInfo.connection = remoteConnection;
        self.peers.push(remotePeerInfo);
        console.log('before send');
        self.send(data, 'accept', remoteConnection);
        self.emit('joinDoc', msg.srcPeerId);
        console.log('Handshake !!!!!!!!');
    }

    this.emit('addUser',msg.data.peerInfo.replicaNumber, msg.data.username);
    if(!this.isAlreadyInPendingList(msg.srcPeerId)){
        console.log('make remote connection');
        var args = new Array(this);
        this.createConnection(msg.srcPeerId, callback, args);
        console.log('the connection');
    }else {
        callback(this);
    }


};

SCAMP.prototype.broadcastMsg = function(data){
    console.log('Broadcast Msg');
    this.clock ++;
    var msg = new Message(this.peerIOAdapter.replicaNumber, this.clock,'broadcast', data, this.peerIOAdapter.peer.id);
    console.log(msg);
    this.pushMsg(msg);
    console.log('onNetwork list :');
    console.log(this.onNetworkMsg);
    msg = JSON.stringify(msg);
    for(var i = 0; i < this.peers.length; i++){
        this.peers[i].connection.send(msg);
    }
};

SCAMP.prototype.send = function(data, context, connection, hop){
    if(connection !== null && connection !==undefined){
        this.clock ++;
        console.log(data);
        var msg = JSON.stringify(new Message(this.peerIOAdapter.replicaNumber, this.clock, context, data, this.peerIOAdapter.peer.id, hop));
        this.pushMsg(msg);
        connection.send(msg);
    }else{
        console.log('Error send');
    }

};

SCAMP.prototype.forwardOffer = function(msg){
    console.log('forward offer');
    var p = 1 / (1 + this.peers.length);
    console.log('proba');
    console.log(p);
    console.log( ! this.isAlreadyInPartialView(msg.data.replicaNumber));
    if(this.peerIOAdapter.peer.id !== msg.srcPeerId){
        if((Math.random() <= p )&& ! this.isAlreadyInPartialView(msg.data.replicaNumber)){
                console.log('Accept the offer');
            if(msg.data !== null && msg.data !== undefined){
                this.acceptOffer(msg);
            }
        }else{
            console.log('forward the offer');

            var index = Math.floor(Math.random() * this.peers.length);
            console.log(index);
            console.log(this.peers[index]);
            //this.peers[index].connection.send(JSON.stringify(msg));
            this.clock ++;
            var newMsg = JSON.stringify(new Message(this.peerIOAdapter.replicaNumber, this.clock, 'offer', msg.data, msg.srcPeerId));
            this.pushMsg(msg);
            this.peers[index].connection.send(newMsg);
            console.log('send');

            //retirer de la pending list
            this.getConnectionFromPendingList(msg.srcPeerId); //remove from pendingList
        }
    }
};

SCAMP.prototype.forwardBroadcast = function(msg){
    this.emit('broadcast', msg);
    if(msg.hop > 0){
        msg.hop -= 1;
        var newMsg = JSON.stringify(msg);
        for (var i = 0; i < this.peers.length; i++) {
            this.peers[i].connection.send(newMsg);
        }
    }
};

SCAMP.prototype.broadcastInfoUser = function() {
    // TODO
};

SCAMP.prototype.refreshOfferRecipients = function() {
    if(this.peers.length > 0){
        this.offerRecipients = [];
        var index = Math.floor(Math.random()*this.peers.length);
        this.makeOffer(index);
    }else{
        this.emit('moreInfoUser');
        this.peerIOAdapter.on('newNeighbor', function(peers){
            this.offerRecipients = peers;
            this.makeOffer();
        })
    }
};

SCAMP.prototype.isKnownMsg = function (msg) {
    console.log('is known message : ');
    if(msg.tag !== null && msg.tag !== undefined){
        console.log('tag !== null');
        var tag = msg.tag;
        console.log('tag : ', tag);
        for (var key in this.onNetworkMsg) {
            console.log('key : ', key);
            if(isEqualTag(key, tag)){
                console.log('true');
                return true;
            }
        }
    }
    console.log('false');
    return false;
};

SCAMP.prototype.pushMsg = function (msg) {
    console.log('push MSG');
    if(msg.tag !== undefined && msg.tag !== null){
        this.onNetworkMsg[msg.tag] = msg;
    }
};

module.exports = SCAMP;
