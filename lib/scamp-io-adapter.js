var events = require('events');

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

var Message = function(replicaNumber, clock, context, data, src){
    this.tag = makeTag(replicaNumber, clock);
    this.context = context;
    this.data = data;
    this.src = src;
};

var SCAMP = function(replicaNumber, peer){
    this.peers = []; //partial view
    this.peer = peer; //peerObject
    this.replicaNumber = replicaNumber;
    this.lease = 0;
    this.clock = 0;
};

SCAMP.prototype.getLength = function(){
    return this.peers.length;
};

SCAMP.prototype.__proto__ = events.EventEmitter.prototype;

SCAMP.prototype.makeOffer = function(peer){
    var slef = this;
    var msg = JSON.stringify(new Message('offer', null, this.peer));

};

SCAMP.prototype.onOffer = function(msg){
    var slef = this;

};

SCAMP.prototype.send = function(data){
    var msg = JSON.stringify(new Message('broadcast', data, this.peer));
    for(var i = 0; i < this.peers.length; i++){
        this.peers[i].connection.send(msg);
    }
};

SCAMP.prototype.receive = function(arg){
    try{
        var msg = JSON.parse(arg);
        if(msg.context !== null && msg.context !== undefined){
            switch(msg.context){
                case 'offer':
                    this.onOffer(msg);
                    break;
                case 'broadcast':
                    this.emit();
                default :
                    console.log("ERREUR SCAMP receive undefined context");
            }
        }catch(e){
            console.log("Not a valid JSON");
        }
    }
};

SCAMP.prototype.forwardOffer = function(msg){

};

