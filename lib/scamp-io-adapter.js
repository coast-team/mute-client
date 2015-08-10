var events = require('events');

var HOP = 7;
/*
Useful functions
 */

function makeTag(replicaNumber, clock){
    return replicaNumber + ':' + clock;
}

function isEqualTag(tag1, tag2){
    if(tag1 === tag2){
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
    console.log('MESSAGE !!');
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
        self.broadcast(data);
    });

};

SCAMP.prototype.__proto__ = events.EventEmitter.prototype;

SCAMP.prototype.init = function(){
    var self = this;

    function initConnect(connection){
        console.log('init connect');
        if(!self.isAlreadyInPeersList(connection.peer) && !self.isAlreadyInPendingList(connection.peer)){
            self.pendingList.push(connection);
            connection.on('data', handleMsg); // data receiving
            connection.on('close', function(){
                //connection closing
                var replicaNumber = self.getReplicaNumber(connection.peer);
                //self.peerIOAdapter.emit('removeUser', replicaNumber);
                self.refreshOfferRecipients();
                self.makeOffer();
                this.close();
                var index = self.peers.indexOf(this);
                self.peers.splice(index, 1);
            });
        }
    }

    function handleMsg(arg){
        console.log('handle msg');
        console.log(arg);
        try{
            var msg = JSON.parse(arg);
            console.log('blob');
            console.log(msg);
            console.log(msg.event);
            if(msg.event !== null && msg.event !== undefined && !self.isKnownMsg(msg)){
                console.log('bob');
                console.log(msg);
                self.pushMsg(msg);
                console.log('blog');
                switch(msg.event){
                    case 'offer':
                        console.log('offer');
                        self.forwardOffer(msg);
                        break;
                    case 'broadcastMsg':
                        break;
                    case 'acceptOffer':
                        self.onOfferAccepted(msg);
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
        }catch(e){
            console.log("Not a valid JSON");
        }
    }

    if(this.firstConnection){
        this.firstConnection = false;
        this.makeOffer();
    }

    this.peerIOAdapter.peer.on('connection', initConnect);

    //faire une offre
};

//Get remonte connection already saved in pending list
//And remove it from pendingList

SCAMP.prototype.getConnection = function(peerId){
    for(var i = 0; i < this.pendingList.length; i++){
        if(this.pendingList[i].peer === peerId){
            var res = this.pendingList[i];
            this.pendingList.splice(i,1);
            return res;
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

SCAMP.prototype.isAlreadyInPendingList = function (replicaNumber) {
    for (var i = 0; i < this.pendingList.length; i++) {
        if(this.pendingList[i].replicaNumber == replicaNumber){
            return true;
        }
    }
    return false;
};

SCAMP.prototype.isAlreadyInPeersList = function (peerId) {
    for (var i = 0; i < this.peers.length; i++) {
        if(this.peers[i].peer == peerId){
            return true;
        }
    }
    return false;
};

/*
for a given peerId, returns the replica number of the right peer
*/

SCAMP.prototype.getReplicaNumber = function(peerId){
    for (var i = 0; i < this.peers.length; i++) {
        if(this.peers[i].connection.peer === peerId){
            console.log(this.peers[i]);
            return this.peers[i].replicaNumber;
        }
    }
    return null;
};


SCAMP.prototype.makeOffer = function(){
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
    if(this.offerRecipients.length > 0){
        this.clock ++;
    }

    for (var i = 0; i < this.offerRecipients.length; i++) {
        sendMsg(this.offerRecipients[i], msg);
    }

    function sendMsg(remoteId, msg){
        console.log('SEND');
        console.log(msg);
        var connection = self.peerIOAdapter.peer.connect(remoteId);
        connection.on('open', function(){
            self.pushMsg(msg);
            initConnect(connection);
            connection.send(msg);
        });
    }

    function initConnect(connection){
        console.log('init connect MAKE OFFER');
        if(!self.isAlreadyInPeersList(connection.peer) && !self.isAlreadyInPendingList(connection.peer)){
            self.pendingList.push(connection);
            connection.on('data', handleMsg); // data receiving
            connection.on('close', function(){
                console.log('close connection');
                //connection closing
                var replicaNumber = self.getReplicaNumber(connection.peer);
                //self.peerIOAdapter.emit('removeUser', replicaNumber);
                console.log(replicaNumber);
                self.refreshOfferRecipients();
                self.makeOffer();
                this.close();
                var index = self.peers.indexOf(this);
                self.peers.splice(index, 1);
            });
        }
    }

    function handleMsg(arg){
        console.log('handle msg');
        console.log(arg);
        try{
            var msg = JSON.parse(arg);
            console.log('blob');
            console.log(msg);
            console.log(msg.event);
            if(msg.event !== null && msg.event !== undefined && !self.isKnownMsg(msg)){
                console.log('bob');
                console.log(msg);
                self.pushMsg(msg);
                console.log('blog');
                console.log(msg.event);
                switch(msg.event){
                    case 'offer':
                        console.log('offer');
                        self.forwardOffer(msg);
                        break;
                    case 'broadcastMsg':
                        break;
                    case 'accept':
                        self.onOfferAccepted(msg);
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
        }catch(e){
            console.log("Not a valid JSON");
        }
    }
};

SCAMP.prototype.onOfferAccepted = function(msg){
    console.log('on Offer accepted');
    console.log(msg);
    var remoteConnection = this.getConnection(msg.srcPeerId);
    if(msg.data !== null && msg.data !== undefined && remoteConnection !== null && remoteConnection !== undefined){
        console.log('Add User');
        this.peerIOAdapter.emit('addUser', msg.data.peerInfo.replicaNumber, msg.data.username);
        console.log('titi');
        var remotePeerInfo = msg.data;
        remotePeerInfo.connection = remoteConnection;
        this.peers.push(remotePeerInfo);
    }
};

SCAMP.prototype.acceptOffer = function(msg){
    console.log('accept offer');
    console.log(msg);
    var peerInfo = new PeerInfo(this.peerIOAdapter.replicaNumber); //PeerInfo of current node
    var remoteConnection = this.getConnection(msg.srcPeerId);
    if(remoteConnection !== null  && remoteConnection !== undefined){
        this.peerIOAdapter.emit('addUser',msg.data.peerInfo.replicaNumber, msg.data.username);
        var remotePeerInfo = msg.data;
        remotePeerInfo.connection = remoteConnection;
        this.peers.push(remotePeerInfo);
        var data = {
            peerId : this.peerIOAdapter.peer.id,
            username : this.peerIOAdapter.username,
            peerInfo : peerInfo
        };
        this.send(data, 'accept', msg.data.connection);
        console.log('Handshake !!!!!!!!');
    }else{
        console.log('Error accept offer');
    }
};

SCAMP.prototype.broadcastMsg = function(data){
    this.clock ++;
    var msg = JSON.stringify(new Message(this.peerIOAdapter.replicaNumber, this.clock,'broadcast', data, this.peerIOAdapter.peer.id));
    this.pushMsg(msg);
    for(var i = 0; i < this.peers.length; i++){
        this.peers[i].connection.send(msg);
    }
};

SCAMP.prototype.send = function(data, context, connection, hop){
    this.clock ++;
    console.log(data);
    var msg = JSON.stringify(new Message(this.peerIOAdapter.replicaNumber, this.clock, context, data, this.peerIOAdapter.peer.id, hop));
    this.pushMsg(msg);
    connection.send(msg);
};

SCAMP.prototype.forwardOffer = function(msg){
    console.log('forward offer');
    var p = 1 / (1 + this.peers.length);
    console.log('proba');
    console.log(p);
    console.log(this.peerIOAdapter.peer.id !== msg.srcPeerId);
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
            this.send(msg.data, 'offer', this.peers[index].connection);
            //this.peers[index].connection.send(JSON.stringify(msg));
            this.clock ++;
            var newMsg = JSON.stringify(new Message(this.peerIOAdapter.replicaNumber, this.clock, 'offer', msg.data, msg.srcPeerId));
            this.pushMsg(msg);
            this.peers[index].connection.send(newMsg);
            console.log('send');

            //retirer de la pending list
            this.getConnection(msg.srcPeerId); //remove from pendingList
        }
    }
};

SCAMP.prototype.forwardBroadcast = function(msg){
    this.emit('broadcast', msg);
    if(msg.hop > 0){
        msg.decreaseHop();
        for (var i = 0; i < this.peers.length; i++) {
            this.peers[i].send(msg);
        }
    }
};

SCAMP.prototype.broadcastInfoUser = function() {
    // TODO
};

SCAMP.prototype.refreshOfferRecipients = function() {
    if(this.peers.length > 0){
        this.offerRecipients = this.peers.slice(0);
    }else{
        /*TODO
        *contacter le serveur et récupérer les autres pairs
        */
    }
};

SCAMP.prototype.isKnownMsg = function (msg) {
    console.log('is known message : ');
    if(msg.tag !== null && msg.tag !== undefined){
        var tag = msg.tag;
        for (var key in this.onNetworkMsg) {
            if(isEqualTag(key, tag)){
                console.log('true');
                return true;
            }
        }
    }
    console.log(false);
    return false;
};

SCAMP.prototype.pushMsg = function (msg) {
    this.onNetworkMsg[msg.tag] = msg;
};

module.exports = SCAMP;
