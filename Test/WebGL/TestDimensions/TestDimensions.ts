namespace WebGLRendering {
    import ƒ = Fudge;
    window.addEventListener("load", init);
    let uiRectangles: { [name: string]: UI.Rectangle } = {};
    let canvas: HTMLCanvasElement;
    let viewPort: ƒ.Viewport = new ƒ.Viewport();
    let camera: ƒ.Node;
    let uiCamera: UI.Camera;

    function init(): void {
        // create asset
        let branch: ƒ.Node = Scenes.createAxisCross();
        branch.addComponent(new ƒ.ComponentTransform());

        // initialize WebGL and transmit content
        ƒ.WebGLApi.initializeContext();
        ƒ.WebGL.addBranch(branch);
        ƒ.WebGL.recalculateAllNodeTransforms();

        // initialize viewports
        canvas = document.getElementsByTagName("canvas")[0];
        camera = Scenes.createCamera(new ƒ.Vector3(1, 2, 3));
        let cmpCamera: ƒ.ComponentCamera = <ƒ.ComponentCamera>camera.getComponent(ƒ.ComponentCamera);
        viewPort.initialize(canvas.id, branch, cmpCamera, canvas);

        ƒ.Loop.addEventListener(ƒ.EVENT.ANIMATION_FRAME, animate);
        ƒ.Loop.start();
        function animate(_event: Event): void {
            branch.cmpTransform.rotateY(1);
            ƒ.WebGL.recalculateAllNodeTransforms();
            // prepare and draw viewport
            viewPort.prepare();
            viewPort.draw();
        }

        let menu: HTMLDivElement = document.getElementsByTagName("div")[0];
        uiCamera = new UI.Camera();
        menu.appendChild(uiCamera);
        appendUIRectangle(menu, "WebGLCanvas");
        appendUIRectangle(menu, "WebGLViewport");
        appendUIRectangle(menu, "Source");
        appendUIRectangle(menu, "Destination");
        appendUIRectangle(menu, "DomCanvas");
        appendUIRectangle(menu, "CSSRectangle");

        setAll({ x: 0, y: 0, width: 300, height: 300 });

        uiCamera.addEventListener("input", hndChangeOnCamera);
        setCamera();
    }

    function appendUIRectangle(_parent: HTMLElement, _name: string): void {
        let uiRectangle: UI.Rectangle = new UI.Rectangle(_name);
        uiRectangle.appendButton("all");
        uiRectangle.addEventListener("click", hndClickOnRect);
        uiRectangle.addEventListener("input", hndChangeOnRect);

        uiRectangle.appendCheckbox("lock");

        _parent.appendChild(uiRectangle);
        uiRectangles[_name] = uiRectangle;
    }

    function hndClickOnRect(_event: Event): void {
        if ((<HTMLElement>_event.target).tagName != "BUTTON")
            return;
        let current: UI.Rectangle = <UI.Rectangle>_event.currentTarget;
        setAll(current.get());
    }

    function hndChangeOnRect(_event: Event): void {
        let target: UI.Rectangle = <UI.Rectangle>_event.currentTarget;
        setRect(target);
    }

    function hndChangeOnCamera(_event: Event): void {
        //let target: UI.Rectangle = <UI.Rectangle>_event.currentTarget;
        setCamera();
    }

    function setAll(_rect: ƒ.Rectangle): void {
        for (let name in uiRectangles) {
            let uiRectangle: UI.Rectangle = uiRectangles[name];
            if (uiRectangle.isLocked())
                continue;
            uiRectangle.set(_rect);
            setRect(uiRectangle);
        }
        update();
    }

    function setRect(_uiRectangle: UI.Rectangle): void {
        let rect: ƒ.Rectangle = _uiRectangle.get();
        switch (_uiRectangle.name) {
            case "WebGLCanvas":
                ƒ.WebGL.setCanvasSize(rect.width, rect.height);
                break;
            case "WebGLViewport":
                ƒ.WebGL.setViewportRectangle(rect);
                break;
            case "Source":
                viewPort.rectSource = rect;
                break;
            case "Destination":
                viewPort.rectDestination = rect;
                break;
            case "DomCanvas":
                canvas.width = rect.width;
                canvas.height = rect.height;
                break;
            case "CSSRectangle":
                canvas.style.left = rect.x + "px";
                canvas.style.top = rect.y + "px";
                canvas.style.width = rect.width + "px";
                canvas.style.height = rect.height + "px";
                break;
            default:
                throw (new Error("Invalid name: " + _uiRectangle.name));
        }
        update();
    }

    function setCamera(): void {
        let params: UI.ParamsCamera = uiCamera.get();
        let cmpCamera: ƒ.ComponentCamera = <ƒ.ComponentCamera>camera.getComponent(ƒ.ComponentCamera);
        cmpCamera.projectCentral(params.aspect, params.fieldOfView);
        update();
    }

    function update(): void {
        uiRectangles["WebGLCanvas"].set(ƒ.WebGL.getCanvasRect());
        uiRectangles["WebGLViewport"].set(ƒ.WebGL.getViewportRectangle());
        uiRectangles["Source"].set(viewPort.rectSource);
        uiRectangles["Destination"].set(viewPort.rectDestination);
        uiRectangles["DomCanvas"].set({ x: 0, y: 0, width: canvas.width, height: canvas.height });
        let client: ClientRect = canvas.getBoundingClientRect();
        uiRectangles["CSSRectangle"].set({ x: client.left, y: client.top, width: client.width, height: client.height });

        let cmpCamera: ƒ.ComponentCamera = <ƒ.ComponentCamera>camera.getComponent(ƒ.ComponentCamera);
        uiCamera.set({ aspect: cmpCamera.getAspect(), fieldOfView: cmpCamera.getFieldOfView() });
    }
}