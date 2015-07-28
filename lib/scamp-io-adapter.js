var events = require('events');

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

function setListeners(connection){

};

var PeerInfo = function(replicaNumber, connection){
    this.replicaNumber = replicaNumber;
    this.connection = connection || null;
};

var Message = function(replicaNumber, clock, context, data, srcPeerId){
    this.tag = makeTag(replicaNumber, clock);
    this.context = context;
    this.data = data;
    this.srcPeerId = srcPeerId; //peerID of emitter
};

/*
    TODO : 
    * implémentation d'un système de hop
*/

var SCAMP = function(replicaNumber, peer, peerIOAdapter, offerRecipients){
    this.peers = []; //partial view
    this.pendingList = [];
    this.offerRecipients = offerRecipients;
    this.peer = peer; //peerObject
    this.replicaNumber = replicaNumber;
    this.peerIOAdapter = peerIOAdapter;
    this.lease = 0;
    this.clock = 0;
    this.firstConnection = true;
};

SCAMP.prototype.__proto__ = events.EventEmitter.prototype;

SCAMP.prototype.init = function(){
    var self =this;

    function initConnect (connection){
        self.pendingList.push(connection);
        peerInfo.connection.on('data', handleMsg); // data receiving
            
            peerInfo.connection.on('close', function(){
                //connection closing
                var replicaNumber = self.getReplicaNumber(peerInfo.connection.peer);
                //self.peerIOAdapter.emit('removeUser', replicaNumber);
                this.close();
                var index = self.peers.indexOf(this);
                self.peers.splice(index, 1);
            });
    }

    function handleMsg(msg){
        try{
            var msg = JSON.parse(arg);
            if(msg.context !== null && msg.context !== undefined){
                switch(msg.context){
                    case 'offer':
                        this.forwardOffer(msg);
                        break;
                    case 'broadcast':
                        //this.emit();
                        break;
                    case 'accept':

                        break; 
                    default :
                        console.log("ERREUR SCAMP receive undefined context");
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

    this.peer.on('connection', initConnect);

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
}

SCAMP.prototype.getLength = function(){
    return this.peers.length;
};

SCAMP.prototype.getPeer = function(index){
    if(index < this.getLength()){
        return this.peers[index];
    }else{
        return null;
    }
};

SCAMP.prototype.isAlreadyInPartialView = function(replicaNumber){
    for (var i = 0; i < this.peers.length; i++) {
        if(this.peers[i].replicaNumber == replicaNumber){
            return true;
        }
    }
    return false;
};

SCAMP.prototype.addPeer = function(msg){
    var self = this;
    var peerInfo = msg.data;
   
    peerInfo.connection = this.getConnection(msg.srcPeerId);
    

    if(peerInfo.connection !== null && peerInfo.connection !== undefined){
        connect(peerInfo);        
    }else{
        console.log("ERROR GET CONNECTION");
    }
};


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
    //Création d'un peerInfo avec le replicanumber et tout...
    var self =this;

    this.clock ++;
    var peerInfo = new PeerInfo(replicanumber);
    var msg = JSON.stringify(new Message(this.replicaNumber, this.clock, 'offer', peerInfo, this.peer.id));
    for (var i = 0; i < this.offerRecipients.length; i++) {
        var connection = this.peer.connect(this.offerRecipients[i]);
        connection.on('open', function(){
            connection.send(msg);
            self.pendingList.push(connection);
        });
    }
    remoteConnection.send(msg);
};

SCAMP.prototype.offerAccepted = function(){

};
    
SCAMP.prototype.broadcast = function(data){
    this.clock ++;
    var msg = JSON.stringify(new Message(this.replicaNumber, clock,'broadcast', data, this.peer.id));
    for(var i = 0; i < this.peers.length; i++){
        this.peers[i].connection.send(msg);
    }
};

SCAMP.prototype.send = function(data, context, connection){
    this.clock ++;
    var msg = JSON.stringify(new Message(this.replicaNumber, clock, data, this.peer.id));
    connection.send(msg);
};


SCAMP.prototype.forwardOffer = function(msg){
    var p = 1 / (1 + this.getLength());
    if(this.peer.id !== msg.src
        && Math.random() <= p
        && ! this.isAlreadyInPartialView(msg.data.replicaNumber)){
        this.addPeer(msg);
        if(msg.data.connection !== null && msg.data.connection !== undefined){
            this.send(null, 'accept', msg.data.connection);
        }
    }else{
        var index = Math.floor(Math.random()*this.getLength());
    }

};