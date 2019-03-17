namespace Fudge {
    /**
     * Represents the interface between the scenegraph, the camera and the renderingcontext.
     * @authors Jascha Karagöl, HFU, 2019 | Jirka Dell'Oro-Friedl, HFU, 2019
     */
    export class Viewport {
        private name: string; // The name to call this viewport by.
        private camera: CameraComponent; // The camera from which's position and view the tree will be rendered.
        private rootNode: Node; // The first node in the tree(branch) that will be rendered.
        private vertexArrayObjects: { [key: string]: WebGLVertexArrayObject } = {}; // Associative array that holds a vertexarrayobject for each node in the tree(branch)
        private buffers: { [key: string]: WebGLBuffer } = {}; // Associative array that holds a buffer for each node in the tree(branch)
        /**
         * Creates a new viewport scenetree with a passed rootnode and camera and initializes all nodes currently in the tree(branch).
         * @param _rootNode 
         * @param _camera 
         */
        public constructor(_name: string, _rootNode: Node, _camera: CameraComponent) {
            this.name = _name;
            this.rootNode = _rootNode;
            this.camera = _camera;
            this.initializeViewportNodes(this.rootNode);
        }

        public get Name(): string {
            return this.name;
        }

        /**
         * Prepares canvas for new draw, updates the worldmatrices of all nodes and calls drawObjects().
         */
        public drawScene(): void {
            if (this.camera.isActive) {
                this.updateCanvasDisplaySizeAndCamera(gl2.canvas);
                let backgroundColor: Vector3 = this.camera.getBackgoundColor();
                gl2.clearColor(backgroundColor.X, backgroundColor.Y, backgroundColor.Z, this.camera.getBackgroundEnabled() ? 1 : 0);
                gl2.clear(gl2.COLOR_BUFFER_BIT | gl2.DEPTH_BUFFER_BIT);
                // Enable backface- and zBuffer-culling.
                gl2.enable(gl2.CULL_FACE);
                gl2.enable(gl2.DEPTH_TEST);
                // TODO: don't do this for each viewport, it needs to be done only once per frame
                this.updateNodeWorldMatrix(this.viewportNodeSceneGraphRoot());
                this.drawObjects(this.rootNode, this.camera.ViewProjectionMatrix);
            }
        }

        /**
         * Initializes the vertexbuffer, material and texture for a passed node and calls this function recursive for all its children.
         * @param _node The node to initialize.
         */
        public initializeViewportNodes(_node: Node): void {
            console.log(_node.Name);
            if (!_node.getComponents(TransformComponent)) {
                let transform: TransformComponent = new TransformComponent();
                _node.addComponent(transform);
            }
            let mesh: MeshComponent;
            if (_node.getComponents(MeshComponent).length == 0) {
                console.log(`No Mesh attached to node named '${_node.Name}'.`);
            }
            else {
                this.initializeNodeBuffer(_node);
                mesh = <MeshComponent>_node.getComponents(MeshComponent)[0];
                gl2.bufferData(gl2.ARRAY_BUFFER, new Float32Array(mesh.Positions), gl2.STATIC_DRAW);
                let materialComponent: MaterialComponent = <MaterialComponent>_node.getComponents(MaterialComponent)[0];

                if (materialComponent) {
                    /*
                    console.log(`No Material attached to node named '${_node.Name}'.`);
                    console.log("Adding standardmaterial...");
                    materialComponent = new MaterialComponent();
                    materialComponent.initialize(AssetManager.getMaterial("standardMaterial"));
                    _node.addComponent(materialComponent);
                    */
                    let positionAttributeLocation: number = materialComponent.Material.PositionAttributeLocation;
                    GLUtil.attributePointer(positionAttributeLocation, mesh.BufferSpecification);
                    this.initializeNodeMaterial(materialComponent, mesh);
                    if (materialComponent.Material.TextureEnabled) {
                        this.initializeNodeTexture(materialComponent, mesh);
                    }
                }
            }
            for (let name in _node.getChildren()) {
                let childNode: Node = _node.getChildren()[name];
                this.initializeViewportNodes(childNode);
            }
        }

        /**
         * Logs this viewports scenegraph to the console.
         */
        public showSceneGraph(): void {
            let output: string = "SceneGraph for this viewport:";
            output += "\n \n";
            output += this.rootNode.Name;
            console.log(output + "   => ROOTNODE" + this.createSceneGraph(this.rootNode));
        }

        /**
         * Draws the passed node with the passed viewprojectionmatrix and calls this function recursive for all its children.
         * @param _node The currend node to be drawn.
         * @param _matrix The viewprojectionmatrix of this viewports camera.
         */
        private drawObjects(_node: Node, _matrix: Matrix4x4): void {
            if (_node.getComponents(MeshComponent).length > 0) {
                let mesh: MeshComponent = <MeshComponent>_node.getComponents(MeshComponent)[0];
                let transform: TransformComponent = <TransformComponent>_node.getComponents(TransformComponent)[0];
                let materialComponent: MaterialComponent = <MaterialComponent>_node.getComponents(MaterialComponent)[0];
                if (materialComponent) {
                    materialComponent.Material.Shader.use();
                    gl2.bindVertexArray(this.vertexArrayObjects[_node.Name]);
                    gl2.enableVertexAttribArray(materialComponent.Material.PositionAttributeLocation);
                    // Compute the matrices
                    let transformMatrix: Matrix4x4 = transform.WorldMatrix;
                    if (_node.getComponents(PivotComponent)) {
                        let pivot: PivotComponent = <PivotComponent>_node.getComponents(PivotComponent)[0];
                        if (pivot)
                            transformMatrix = Matrix4x4.multiply(pivot.Matrix, transform.WorldMatrix);
                    }
                    let objectViewProjectionMatrix: Matrix4x4 = Matrix4x4.multiply(_matrix, transformMatrix);
                    // Supply matrixdata to shader. 
                    gl2.uniformMatrix4fv(materialComponent.Material.MatrixUniformLocation, false, objectViewProjectionMatrix.Data);
                    // Draw call
                    gl2.drawArrays(gl2.TRIANGLES, mesh.BufferSpecification.offset, mesh.VertexCount);
                }
            }
            for (let name in _node.getChildren()) {
                let childNode: Node = _node.getChildren()[name];
                this.drawObjects(childNode, _matrix);
            }
        }
        /**
         * Updates the transforms worldmatrix of a passed node for the drawcall and calls this function recursive for all its children.
         * @param _node The node which's transform worldmatrix to update.
         */
        private updateNodeWorldMatrix(_node: Node): void {
            let transform: TransformComponent = <TransformComponent>_node.getComponents(TransformComponent)[0];
            if (!_node.Parent) {
                transform.WorldMatrix = transform.Matrix;
            }
            else {
                let parentTransform: TransformComponent = (<TransformComponent>_node.Parent.getComponents(TransformComponent)[0]);
                transform.WorldMatrix = Matrix4x4.multiply(parentTransform.WorldMatrix, transform.Matrix);
            }
            for (let name in _node.getChildren()) {
                let childNode: Node = _node.getChildren()[name];
                this.updateNodeWorldMatrix(childNode);
            }
        }
        /**
         * Returns the scenegraph's rootnode for computation of worldmatrices.
         */
        private viewportNodeSceneGraphRoot(): Node {
            let sceneGraphRoot: Node = this.rootNode;
            while (sceneGraphRoot.Parent) {
                sceneGraphRoot = sceneGraphRoot.Parent;
            }
            return sceneGraphRoot;
        }
        /**
         * Initializes the vertexbuffer for a passed node.
         * @param _node The node to initialize a buffer for.
         */
        private initializeNodeBuffer(_node: Node): void {
            let bufferCreated: WebGLBuffer | null = gl2.createBuffer();
            if (bufferCreated === null)
                return;
            let buffer: WebGLBuffer = bufferCreated;
            this.buffers[_node.Name] = buffer;
            let vertexArrayObjectCreated: WebGLVertexArrayObject | null = gl2.createVertexArray();
            if (vertexArrayObjectCreated === null) return;
            let vertexArrayObject: WebGLVertexArrayObject = vertexArrayObjectCreated;
            this.vertexArrayObjects[_node.Name] = vertexArrayObject;
            gl2.bindVertexArray(vertexArrayObject);
            gl2.bindBuffer(gl2.ARRAY_BUFFER, buffer);
        }

        /**
         * Initializes the colorbuffer for a node depending on its mesh- and materialcomponent.
         * @param _material The node's materialcomponent.
         * @param _mesh The node's meshcomponent.
         */
        private initializeNodeMaterial(_materialComponent: MaterialComponent, _meshComponent: MeshComponent): void {
            let colorBuffer: WebGLBuffer = GLUtil.assert<WebGLBuffer>(gl2.createBuffer());
            gl2.bindBuffer(gl2.ARRAY_BUFFER, colorBuffer);
            _meshComponent.applyColor(_materialComponent);
            let colorAttributeLocation: number = _materialComponent.Material.ColorAttributeLocation;
            gl2.enableVertexAttribArray(colorAttributeLocation);
            GLUtil.attributePointer(colorAttributeLocation, _materialComponent.Material.ColorBufferSpecification);
        }

        /**
         * Initializes the texturebuffer for a node, depending on its mesh- and materialcomponent.
         * @param _material The node's materialcomponent.
         * @param _mesh The node's meshcomponent.
         */
        private initializeNodeTexture(_materialComponent: MaterialComponent, _meshComponent: MeshComponent): void {
            let textureCoordinateAttributeLocation: number = _materialComponent.Material.TextureCoordinateLocation;
            let textureCoordinateBuffer: WebGLBuffer = gl2.createBuffer();
            gl2.bindBuffer(gl2.ARRAY_BUFFER, textureCoordinateBuffer);
            _meshComponent.setTextureCoordinates();
            gl2.enableVertexAttribArray(textureCoordinateAttributeLocation);
            GLUtil.attributePointer(textureCoordinateAttributeLocation, _materialComponent.Material.TextureBufferSpecification);
            GLUtil.createTexture(_materialComponent.Material.TextureSource);
        }

        /**
         * Creates an outputstring as visual representation of this viewports scenegraph. Called for the passed node and recursive for all its children.
         * @param _fudgeNode The node to create a scenegraphentry for.
         */
        private createSceneGraph(_fudgeNode: Node): string {
            let output: string = "";
            for (let name in _fudgeNode.getChildren()) {
                let child: Node = _fudgeNode.getChildren()[name];
                output += "\n";
                let current: Node = child;
                if (current.Parent && current.Parent.Parent)
                    output += "|";
                while (current.Parent && current.Parent.Parent) {
                    output += "   ";
                    current = current.Parent;
                }
                output += "'--";

                output += child.Name;
                output += this.createSceneGraph(child);
            }
            return output;
        }

        /**
         * Updates the displaysize of the passed canvas depending on the client's size and an optional multiplier.
         * Adjusts the viewports camera and the renderingcontexts viewport to fit the canvassize.
         * @param canvas The canvas to readjust.
         * @param multiplier A multiplier to adjust the displayzise dimensions by.
         */
        private updateCanvasDisplaySizeAndCamera(canvas: HTMLCanvasElement, multiplier?: number): void {
            multiplier = multiplier || 1;
            let width: number = canvas.clientWidth * multiplier | 0;
            let height: number = canvas.clientHeight * multiplier | 0;
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
            // TODO: camera should adjust itself to resized canvas by e.g. this.camera.resize(...)
            if (this.camera.isOrthographic)
                this.camera.projectOrthographic(0, width, height, 0);
            else
                this.camera.projectCentral(width / height); //, this.camera.FieldOfView);
            gl2.viewport(0, 0, width, height);
        }
    }
}