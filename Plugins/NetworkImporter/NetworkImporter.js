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

    var NetworkImporter = function () {
        // Call base class's constructor
        PluginBase.call(this);

        this.networkNodes = {};
    };

    //basic functions and setting for plugin inheritance
    NetworkImporter.prototype = Object.create(PluginBase.prototype);
    NetworkImporter.prototype.constructor = NetworkImporter;
    NetworkImporter.prototype.getName = function () {
        return "Network Importer";
    };

    NetworkImporter.prototype.getConfigStructure = function () {
        return [
            {name: 'networkFile',
             displayName: 'Network File',
             description: 'Network file for netsim',
             valueType: 'asset',
             readOnly: false}
        ];
    };

    //helper functions created by Tamas ;)
    NetworkImporter.prototype._loadStartingNodes = function(callback){
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

    NetworkImporter.prototype._isTypeOf = function(node,type){
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

    NetworkImporter.prototype.getNode = function(nodePath){
        // we check only our node cache
        return this._nodeCache[nodePath];
    };

    // the main entry point of plugin execution
    NetworkImporter.prototype.main = function (callback) {
        var self = this;
        self.config = self.getCurrentConfig();

        //If activeNode is null, we won't be able to run 
        if(!self._isTypeOf(self.activeNode, self.META.network)) {
            self._errorMessages(self.activeNode, "Current project is an invalid type. Please run the plugin on a network.");
        }

        //console.log(config.preview,config.configuration);
        self.logger.info("Running Network Importer");

        //setting up cache
        self._loadStartingNodes(function(err){
            if(err){
                //finishing
                self.result.success = false;
                callback(err,self.result);
            } else {
                //executing the plugin
                self.logger.info("Finished loading children");
                err = self._runSync();
                if (err){
                    self.result.success = false;
                    callback(err,self.result);
                } else {
                    var counter = self.config.preview + self.config.configuration;
                    if(self.config.configuration){
                        self._saveOutput(self.projectName.replace(" ", "_") + ".dax", self.output, function(err){
                            if(err){ 
                                self.result.success = false;
                                callback(err,self.result);
                            } else {
                                if(--counter === 0){
                                    if(callback){
                                        self.result.success = true;
                                        callback(null,self.result);
                                    }
                                }
                            }
                        });
                    }

                    if(self.config.preview){
                        self.save("Pegasus plugin modified project",function(err){
                            if(err){ 
                                self.result.success = false;
                                callback(err,self.result);
                            } else {
                                if(--counter === 0){
                                    if(callback){
                                        self.result.success = true;
                                        callback(null,self.result);
                                    }
                                }
                            }
                        });
                    }
                }
            }
        });
    };

    NetworkImporter.prototype._runSync = function(){
        // Extract the edge list from the uploaded file
        var file = this.config;
        var edgeList = this._getEdgeListFromFile(file);
        // TODO

        // Create the node info in memory
        // TODO

        // Create the network model from the node info
        // TODO

        return null;
    };

    NetworkImporter.prototype._errorMessages = function(message){
        //TODO the erroneous node should be send to the function
        var self = this;
        self.createMessage(self.activeNode,message);
    };

    return NetworkImporter;
});
