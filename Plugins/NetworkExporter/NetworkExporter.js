/*globals define*/
/*
 * @author brollb
 */

define(['plugin/PluginConfig',
        'plugin/PluginBase',
        'util/assert',
        'util/guid'],function(PluginConfig,
                              PluginBase,
                              assert,
                              genGuid){

    'use strict';

    var NetworkExporter = function () {
        // Call base class's constructor
        PluginBase.call(this);
    };

    //basic functions and setting for plugin inheritance
    NetworkExporter.prototype = Object.create(PluginBase.prototype);
    NetworkExporter.prototype.constructor = NetworkExporter;
    NetworkExporter.prototype.getName = function () {
        return "Network Exporter";
    };

    //helper functions created by Tamas ;)
    NetworkExporter.prototype._loadStartingNodes = function(callback){
        //we load the children of the active node
        var self = this;
        this._nodeCache = {};
        var load = function(node, fn){
            self.core.loadChildren(node,function(err,children){
                if (err){
                    fn(err);
                } else {
                    var j = children.length,
                        e = null; //error

                    if (j === 0){
                        fn(null);
                    }

                    for (var i=0;i<children.length;i++){
                        self._nodeCache[self.core.getPath(children[i])] = children[i];
                        load(children[i], function(err){
                            e = e || err;
                            if (--j === 0){ //callback only on last child
                                fn(e);
                            }
                        });
                    }
                }
            });
        };

        load(self.activeNode, callback);

    };

    NetworkExporter.prototype._isTypeOf = function(node,type){
        //now we make the check based upon path
        if(node === undefined || node === null || type === undefined || type === null){
            return false;
        }

        while(node){
            if(this.core.getPath(node) === this.core.getPath(type)){
                return true;
            }
            node = this.core.getBase(node);
        }
        return false;
    };

    NetworkExporter.prototype.getNode = function(nodePath){
        // we check only our node cache
        return this._nodeCache[nodePath];
    };

    // the main entry point of plugin execution
    NetworkExporter.prototype.main = function (callback) {
        var self = this;
        self.config = self.getCurrentConfig();

        //If activeNode is null, we won't be able to run 
        if(!self._isTypeOf(self.activeNode, self.META.network)) {
            self._errorMessages(self.activeNode, "Current project is an invalid type. Please run the plugin on a network.");
        }

        //console.log(config.preview,config.configuration);
        self.logger.info("Running Network Exporter");

        //setting up cache
        self._loadStartingNodes(function(err){
            if(err){
                //finishing
                self.result.success = false;
                callback(err,self.result);
            } else {
                //executing the plugin
                self.logger.info("Finished loading children");
                self._runPlugin(callback);
            }
        });
    };

    NetworkExporter.prototype._runPlugin = function(callback) {
        // Get all nodes
        var nodeIds = this.core.getChildrenPaths(this.activeNode),
            connections = [],
            node,
            i;

        // Filter edges
        for (i = nodeIds.length; i--;) {
            node = this.getNode(nodeIds[i]);
            if(this._isTypeOf(node,this.META.connection)){
                connections.push(node);
            }
        }

        // Create network definition
        var network = this._createNetworkDefinition(connections);

        // Save file
        this._saveNetworkConfig(network);

        this.result.setSuccess(true);
        callback(null, this.result);
    };

    /**
     * Create a network definition from a connection list
     *
     * @param {Array} connections
     * @return {Array} netsim network
     */
    NetworkExporter.prototype._createNetworkDefinition = function(connections) {
        var connList = [];
        for (var i = connections.length; i--;) {
            connList.push(this._createEdgeDefinition(connections[i]));
        }
        return connList;
    };

    NetworkExporter.prototype._createEdgeDefinition = function(node) {
        return {
            src: this._getPointerNodeName(node, 'src'),
            dst: this._getPointerNodeName(node, 'dst'),
            packetLoss: this.core.getAttribute(node, 'packet loss'),
            latencyMean: this.core.getAttribute(node, 'latency mean'),
            latencySigma: this.core.getAttribute(node, 'latency variance'),

            // UI Stuff -- Not necessary for netsim functionality (used
            // for importing correctly)
            srcPosition: this._getPointerNodePosition(node, 'src'),
            dstPosition: this._getPointerNodePosition(node, 'dst')
        };

    };

    NetworkExporter.prototype._getPointerNode = function(node, ptr) {
        var path = this.core.getPointerPath(node, ptr),
            target = this.getNode(path);

        return target;
    };

    NetworkExporter.prototype._getPointerNodeName = function(node, ptr) {
        var target = this._getPointerNode(node, ptr);

        return this.core.getAttribute(target, 'name');
    };

    NetworkExporter.prototype._getPointerNodePosition = function(node, ptr) {
        var target = this._getPointerNode(node, ptr);

        return this.core.getRegistry(target, 'position');
    };

    //transformed
    NetworkExporter.prototype._saveNetworkConfig = function(network){
        var name = this.core.getAttribute(this.activeNode, 'name'),
            content = 'module.exports = '+JSON.stringify(network)+';';

        this._saveOutput(name, content, function(err) {
            if (err) {
                console.err('Error saving network:', err);
            } else {
                console.log('Saving network!');
            }
        });
    };

    //Thanks to Tamas for the next two functions
    NetworkExporter.prototype._saveOutput = function(filename,stringFileContent,callback){
        var self = this,
            artifact = self.blobClient.createArtifact(filename.replace(" ", "_")+"_Config");

        artifact.addFile(filename,stringFileContent,function(err){
            if(err){
                callback(err);
            } else {
                self.blobClient.saveAllArtifacts(function(err, hashes) {
                    if (err) {
                        callback(err);
                    } else {
                        self.logger.info('Artifacts are saved here:');
                        self.logger.info(hashes);

                        // result add hashes
                        for (var j = 0; j < hashes.length; j += 1) {
                            self.result.addArtifact(hashes[j]);
                        }

                        self.result.setSuccess(true);
                        callback(null);
                    }
                });
            }
        });
    };

    NetworkExporter.prototype._errorMessages = function(message){
        //TODO the erroneous node should be send to the function
        var self = this;
        self.createMessage(self.activeNode,message);
    };

    return NetworkExporter;
});
