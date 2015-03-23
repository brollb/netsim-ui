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
        this.networkEdges = [];
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
             value: '',
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
                self._runPlugin(callback);
            }
        });
    };

    NetworkImporter.prototype._runPlugin = function(callback){
        var self = this,
            fileHash = this.config.networkFile;

        this.blobClient.getMetadata(fileHash, function(err, mdata) {
            if (err) {
                var msg = 'Could not retrieve file metadata: '+JSON.stringify(err);
                console.error(msg);
                return self._errorMessages(msg);
            }

            var name = mdata.name;
            self.blobClient.getObject(fileHash, function(err, arrayBuffer) {
                var file = String.fromCharCode.apply(null, 
                               new Uint8Array(arrayBuffer));
                console.log('error is ', err);
                console.log('file is ', file);

                if (err) {
                    console.error('Could not retrieve uploaded file:', err);
                    self._errorMessages(err);
                } else {
                    // Extract the edge list from the uploaded file
                    self.createEdgeListFromFile(file);

                    // Create the node info in memory
                    self.createVirtualNodes();

                    // Create the network model from the node info
                    self.createModel(name);

                    self.result.setSuccess(true);
                    self.save('Imported '+name, function(err) {
                        callback(null, self.result);
                    });
                }
            });
        });
    };

    /**
     * Return the edge list given the file content.
     *
     * @param {String} file
     * @return {Array} Edges
     */
    NetworkImporter.prototype.createEdgeListFromFile = function(file) {
        var data = file.split('module.exports').pop(),
            edgeRegex = /\[.*\]/,
            edges;

        // Validate the edge list
        if (!this._validateEdgeListText(data)) {
            return this._errorMessages('Invalid network file');
        }

        data = data.replace(/\n/g, '');  // Remove all new lines
        edges = JSON.parse(edgeRegex.exec(data)[0]);

        if (!edges.length) {
            return this._errorMessages('Edges are invalid or empty');
        }

        this.networkEdges = edges;
    };

    /**
     * Validate the edgelist text.
     *
     * @param {String} data
     * @return {boolean} valid
     */
    NetworkImporter.prototype._validateEdgeListText = function(data) {
        // This could probably be done better
        return data.indexOf('var ') + data.indexOf('()') === -2;
    };

    /**
     * Create virtual nodes from edge list retrieved from file.
     *
     * @return {undefined}
     */
    NetworkImporter.prototype.createVirtualNodes = function() {
        var edges = this.networkEdges;
        for (var i = edges.length; i--;) {
            // Create node
            this._createVirtualNode({id: edges[i].src,
                                     position: edges[i].srcPosition});

            this._createVirtualNode({id: edges[i].dst,
                                     position: edges[i].dstPosition});
        }
    };

    /**
     * Create a single virtual node.
     *
     * @param {netsim Edge} edge
     * @return {undefined}
     */
    NetworkImporter.prototype._createVirtualNode = function(node) {
        this.networkNodes[node.id] = {
            position: (node.position || {x:100, y:100})
        };
    };

    /**
     * Create WebGME model from the virtual nodes and edges.
     *
     * @return {undefined}
     */
    NetworkImporter.prototype.createModel = function(name) {
        // Create parent node
        var parentNode = this.createOutputNode(name);
        var nodeMap = this.createModelNodes(parentNode);
        this.createModelEdges(parentNode, nodeMap);
    };

    /**
     * Create the output node for the generated network model.
     *
     * @return {Node} parentNode
     */
    NetworkImporter.prototype.createOutputNode = function(name) {
        var parentNode,
            root = this.core.getRoot(this.activeNode);

        // Get the activeNode
        parentNode = this.core.createNode({parent: root, base: this.META.network});

        // Set the name
        name = name.substring(0, name.lastIndexOf('.'));
        name += ' (IMPORTED)';
        this.core.setAttribute(parentNode, 'name', name);
        return parentNode;
    };

    /**
     * Create WebGME node networks.
     *
     * @return {Dictionary} nodeMap
     */
    NetworkImporter.prototype.createModelNodes = function(parentNode) {
        var nodeIds = Object.keys(this.networkNodes),
            nodeMap = {},
            id;

        for (var i = nodeIds.length; i--;) {
            id = this.core.createNode({parent: parentNode, 
                                       base: this.META.node});

            this.core.setAttribute(id, 'name', nodeIds[i]);
            this.core.setRegistry(id, 'position', 
                                  this.networkNodes[nodeIds[i]].position);

            nodeMap[nodeIds[i]] = id;  // Store the node by it's name
        }
        return nodeMap;
    };

    NetworkImporter.prototype.createModelEdges = function(parentNode, nodeMap) {
        var conn,
            src,
            dst;

        for (var i = this.networkEdges.length; i--;) {
            src = nodeMap[this.networkEdges[i].src];
            dst = nodeMap[this.networkEdges[i].dst];

            conn = this.core.createNode({parent: parentNode, 
                                       base: this.META.connection});
            this.core.setPointer(conn, 'src', src);
            this.core.setPointer(conn, 'dst', dst);
        }
    };

    NetworkImporter.prototype._errorMessages = function(message){
        //TODO the erroneous node should be send to the function
        var self = this;
        self.createMessage(self.activeNode,message);
    };

    return NetworkImporter;
});
