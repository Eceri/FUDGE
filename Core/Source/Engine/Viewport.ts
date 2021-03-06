namespace FudgeCore {
  /**
   * Controls the rendering of a graph, using the given [[ComponentCamera]],
   * and the propagation of the rendered image from the offscreen renderbuffer to the target canvas
   * through a series of [[Framing]] objects. The stages involved are in order of rendering
   * [[RenderManager]].viewport -> [[Viewport]].source -> [[Viewport]].destination -> DOM-Canvas -> Client(CSS)
   * @authors Jascha Karagöl, HFU, 2019 | Jirka Dell'Oro-Friedl, HFU, 2019
   */
  export class Viewport extends EventTargetƒ {
    private static focus: Viewport;

    public name: string = "Viewport"; // The name to call this viewport by.
    public camera: ComponentCamera = null; // The camera representing the view parameters to render the graph.

    public rectSource: Rectangle;
    public rectDestination: Rectangle;

    // TODO: verify if client to canvas should be in Viewport or somewhere else (Window, Container?)
    // Multiple viewports using the same canvas shouldn't differ here...
    // different framing methods can be used, this is the default
    public frameClientToCanvas: FramingScaled = new FramingScaled();
    public frameCanvasToDestination: FramingComplex = new FramingComplex();
    public frameDestinationToSource: FramingScaled = new FramingScaled();
    public frameSourceToRender: FramingScaled = new FramingScaled();

    public adjustingFrames: boolean = true;
    public adjustingCamera: boolean = true;


    private graph: Node = null; // The first node in the graph that will be rendered.
    private crc2: CanvasRenderingContext2D = null;
    private canvas: HTMLCanvasElement = null;
    private pickBuffers: PickBuffer[] = [];
    //#endregion

    // #region Events (passing from canvas to viewport and from there into graph)
    /**
     * Returns true if this viewport currently has focus and thus receives keyboard events
     */
    public get hasFocus(): boolean {
      return (Viewport.focus == this);
    }

    /**
     * Connects the viewport to the given canvas to render the given graph to using the given camera-component, and names the viewport as given.
     */
    public initialize(_name: string, _graph: Node, _camera: ComponentCamera, _canvas: HTMLCanvasElement): void {
      this.name = _name;
      this.camera = _camera;
      this.canvas = _canvas;
      this.crc2 = _canvas.getContext("2d");

      this.rectSource = RenderManager.getCanvasRect();
      this.rectDestination = this.getClientRectangle();

      this.setGraph(_graph);
    }
    /**
     * Retrieve the destination canvas
     */
    public getCanvas(): HTMLCanvasElement {
      return this.canvas;
    }
    /**
     * Retrieve the 2D-context attached to the destination canvas
     */
    public getContext(): CanvasRenderingContext2D {
      return this.crc2;
    }
    /**
     * Retrieve the size of the destination canvas as a rectangle, x and y are always 0 
     */
    public getCanvasRectangle(): Rectangle {
      return Rectangle.GET(0, 0, this.canvas.width, this.canvas.height);
    }
    /**
     * Retrieve the client rectangle the canvas is displayed and fit in, x and y are always 0 
     */
    public getClientRectangle(): Rectangle {
      // FUDGE doesn't care about where the client rect is, only about the size matters.
      // return Rectangle.GET(this.canvas.offsetLeft, this.canvas.offsetTop, this.canvas.clientWidth, this.canvas.clientHeight);
      return Rectangle.GET(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    }

    /**
     * Set the graph to be drawn in the viewport.
     */
    public setGraph(_graph: Node): void {
      if (this.graph) {
        this.graph.removeEventListener(EVENT.COMPONENT_ADD, this.hndComponentEvent);
        this.graph.removeEventListener(EVENT.COMPONENT_REMOVE, this.hndComponentEvent);
      }
      this.graph = _graph;
      if (this.graph) {
        this.graph.addEventListener(EVENT.COMPONENT_ADD, this.hndComponentEvent);
        this.graph.addEventListener(EVENT.COMPONENT_REMOVE, this.hndComponentEvent);
      }
    }

    public getGraph(): Node {
      return this.graph;
    }

    /**
     * Logs this viewports scenegraph to the console.
     */
    public showSceneGraph(): void {
      // TODO: move to debug-class
      let output: string = "SceneGraph for this viewport:";
      output += "\n \n";
      output += this.graph.name;
      Debug.log(output + "   => ROOTNODE" + this.graph.toHierarchyString());
    }

    // #region Drawing
    /**
     * Draw this viewport
     */
    public draw(): void {
      RenderManager.resetFrameBuffer();
      if (!this.camera.isActive)
        return;
      if (this.adjustingFrames)
        this.adjustFrames();
      if (this.adjustingCamera)
        this.adjustCamera();

      RenderManager.clear(this.camera.backgroundColor);
      RenderManager.drawGraph(this.graph, this.camera);

      this.crc2.imageSmoothingEnabled = false;
      this.crc2.drawImage(
        RenderManager.getCanvas(),
        this.rectSource.x, this.rectSource.y, this.rectSource.width, this.rectSource.height,
        this.rectDestination.x, this.rectDestination.y, this.rectDestination.width, this.rectDestination.height
      );
    }

    /**
    * Draw this viewport for RayCast
    */
    public createPickBuffers(): void {
      if (this.adjustingFrames)
        this.adjustFrames();
      if (this.adjustingCamera)
        this.adjustCamera();
      this.pickBuffers = RenderManager.drawGraphForRayCast(this.graph, this.camera);
    }


    public pickNodeAt(_pos: Vector2): RayHit[] {
      // this.createPickBuffers();
      let hits: RayHit[] = RenderManager.pickNodeAt(_pos, this.pickBuffers, this.rectSource);
      hits.sort((a: RayHit, b: RayHit) => (b.zBuffer > 0) ? (a.zBuffer > 0) ? a.zBuffer - b.zBuffer : 1 : -1);
      return hits;
    }

    /**
     * Adjust all frames involved in the rendering process from the display area in the client up to the renderer canvas
     */
    public adjustFrames(): void {
      // get the rectangle of the canvas area as displayed (consider css)
      let rectClient: Rectangle = this.getClientRectangle();
      // adjust the canvas size according to the given framing applied to client
      let rectCanvas: Rectangle = this.frameClientToCanvas.getRect(rectClient);
      this.canvas.width = rectCanvas.width;
      this.canvas.height = rectCanvas.height;
      // adjust the destination area on the target-canvas to render to by applying the framing to canvas
      this.rectDestination = this.frameCanvasToDestination.getRect(rectCanvas);
      // adjust the area on the source-canvas to render from by applying the framing to destination area
      this.rectSource = this.frameDestinationToSource.getRect(this.rectDestination);
      // having an offset source does make sense only when multiple viewports display parts of the same rendering. For now: shift it to 0,0
      this.rectSource.x = this.rectSource.y = 0;
      // still, a partial image of the rendering may be retrieved by moving and resizing the render viewport
      let rectRender: Rectangle = this.frameSourceToRender.getRect(this.rectSource);
      RenderManager.setViewportRectangle(rectRender);
      // no more transformation after this for now, offscreen canvas and render-viewport have the same size
      RenderManager.setCanvasSize(rectRender.width, rectRender.height);
    }
    /**
     * Adjust the camera parameters to fit the rendering into the render vieport
     */
    public adjustCamera(): void {
      let rect: Rectangle = RenderManager.getViewportRectangle();
      this.camera.projectCentral(
        rect.width / rect.height, this.camera.getFieldOfView(), this.camera.getDirection(), this.camera.getNear(), this.camera.getFar());
    }
    // #endregion

    //#region Points
    /**
     * Returns a [[Ray]] in world coordinates from this camera through the point given in client space
     */
    public getRayFromClient(_point: Vector2): Ray {
      let posProjection: Vector2 = this.pointClientToProjection(_point);
      let ray: Ray = new Ray(new Vector3(-posProjection.x, posProjection.y, 1));

      // ray.direction.scale(camera.distance);
      ray.origin.transform(this.camera.pivot);
      ray.direction.transform(this.camera.pivot, false);
      let cameraNode: Node = this.camera.getContainer();
      if (cameraNode) {
        ray.origin.transform(cameraNode.mtxWorld);
        ray.direction.transform(cameraNode.mtxWorld, false);
      }
      return ray;
    }

    public pointWorldToClient(_position: Vector3): Vector2 {
      let projection: Vector3 = this.camera.project(_position);
      let posClient: Vector2 = this.pointClipToClient(projection.toVector2());
      return posClient;
    }

    /**
     * Returns a point on the source-rectangle matching the given point on the client rectangle
     */
    public pointClientToSource(_client: Vector2): Vector2 {
      let result: Vector2 = this.frameClientToCanvas.getPoint(_client, this.getClientRectangle());
      result = this.frameCanvasToDestination.getPoint(result, this.getCanvasRectangle());
      result = this.frameDestinationToSource.getPoint(result, this.rectSource);
      //TODO: when Source, Render and RenderViewport deviate, continue transformation 
      return result;
    }
    /**
     * Returns a point on the render-rectangle matching the given point on the source rectangle
     */
    public pointSourceToRender(_source: Vector2): Vector2 {
      let projectionRectangle: Rectangle = this.camera.getProjectionRectangle();
      let point: Vector2 = this.frameSourceToRender.getPoint(_source, projectionRectangle);
      return point;
    }

    /**
     * Returns a point on the render-rectangle matching the given point on the client rectangle
     */
    public pointClientToRender(_client: Vector2): Vector2 {
      let point: Vector2 = this.pointClientToSource(_client);
      point = this.pointSourceToRender(point);
      //TODO: when Render and RenderViewport deviate, continue transformation 
      return point;
    }

    /**
     * Returns a point in normed view-rectangle matching the given point on the client rectangle
     * The view-rectangle matches the client size in the hypothetical distance of 1 to the camera, its origin in the center and y-axis pointing up
     * TODO: examine, if this should be a camera-method. Current implementation is for central-projection
     */
    public pointClientToProjection(_client: Vector2): Vector2 {
      let posRender: Vector2 = this.pointClientToRender(_client);
      let rectRender: Rectangle = this.frameSourceToRender.getRect(this.rectSource);
      let rectProjection: Rectangle = this.camera.getProjectionRectangle();

      let posProjection: Vector2 = new Vector2(
        rectProjection.width * posRender.x / rectRender.width,
        rectProjection.height * posRender.y / rectRender.height
      );

      posProjection.subtract(new Vector2(rectProjection.width / 2, rectProjection.height / 2));
      posProjection.y *= -1;

      return posProjection;
    }

    /**
     * Returns a point in the client rectangle matching the given point in normed clipspace rectangle, 
     * which stretches from -1 to 1 in both dimensions, y pointing up
     */
    public pointClipToClient(_normed: Vector2): Vector2 {
      // let rectClient: Rectangle = this.getClientRectangle();
      // let result: Vector2 = Vector2.ONE(0.5);
      // result.x *= (_normed.x + 1) * rectClient.width;
      // result.y *= (1 - _normed.y) * rectClient.height;
      // result.add(rectClient.position);
      //TODO: check if rectDestination can be safely (and more perfomant) be used instead getClientRectangle
      let pointClient: Vector2 = RenderManager.rectClip.pointToRect(_normed, this.rectDestination);
      return pointClient;
    }
    /**
     * Returns a point in the client rectangle matching the given point in normed clipspace rectangle, 
     * which stretches from -1 to 1 in both dimensions, y pointing up
     */
    public pointClipToCanvas(_normed: Vector2): Vector2 {
      let pointCanvas: Vector2 = RenderManager.rectClip.pointToRect(_normed, this.getCanvasRectangle());
      return pointCanvas;
    }

    public pointClientToScreen(_client: Vector2): Vector2 {
      let screen: Vector2 = new Vector2(this.canvas.offsetLeft + _client.x, this.canvas.offsetTop + _client.y);
      return screen;
    }
    /**
     * Switch the viewports focus on or off. Only one viewport in one FUDGE instance can have the focus, thus receiving keyboard events. 
     * So a viewport currently having the focus will lose it, when another one receives it. The viewports fire [[Event]]s accordingly.
     * // TODO: examine, if this can be achieved by regular DOM-Focus and tabindex=0
     * @param _on 
     */
    public setFocus(_on: boolean): void {
      if (_on) {
        if (Viewport.focus == this)
          return;
        if (Viewport.focus)
          Viewport.focus.dispatchEvent(new Event(EVENT.FOCUS_OUT));
        Viewport.focus = this;
        this.dispatchEvent(new Event(EVENT.FOCUS_IN));
      }
      else {
        if (Viewport.focus != this)
          return;

        this.dispatchEvent(new Event(EVENT.FOCUS_OUT));
        Viewport.focus = null;
      }
    }
    /**
     * De- / Activates the given pointer event to be propagated into the viewport as FUDGE-Event 
     * @param _type 
     * @param _on 
     */
    public activatePointerEvent(_type: EVENT_POINTER, _on: boolean): void {
      this.activateEvent(this.canvas, _type, this.hndPointerEvent, _on);
    }
    /**
     * De- / Activates the given keyboard event to be propagated into the viewport as FUDGE-Event
     * @param _type 
     * @param _on 
     */
    public activateKeyboardEvent(_type: EVENT_KEYBOARD, _on: boolean): void {
      this.activateEvent(this.canvas.ownerDocument, _type, this.hndKeyboardEvent, _on);
    }
    /**
     * De- / Activates the given drag-drop event to be propagated into the viewport as FUDGE-Event
     * @param _type 
     * @param _on 
     */
    public activateDragDropEvent(_type: EVENT_DRAGDROP, _on: boolean): void {
      if (_type == EVENT_DRAGDROP.START)
        this.canvas.draggable = _on;
      this.activateEvent(this.canvas, _type, this.hndDragDropEvent, _on);
    }
    /**
     * De- / Activates the wheel event to be propagated into the viewport as FUDGE-Event
     * @param _type 
     * @param _on 
     */
    public activateWheelEvent(_type: EVENT_WHEEL, _on: boolean): void {
      this.activateEvent(this.canvas, _type, this.hndWheelEvent, _on);
    }
    /**
     * Handle drag-drop events and dispatch to viewport as FUDGE-Event
     */
    private hndDragDropEvent: EventListener = (_event: Event) => {
      let _dragevent: EventDragDrop = <EventDragDrop>_event;
      switch (_dragevent.type) {
        case "dragover":
        case "drop":
          _dragevent.preventDefault();
          _dragevent.dataTransfer.effectAllowed = "none";
          break;
        case "dragstart":
          // just dummy data,  valid data should be set in handler registered by the user
          _dragevent.dataTransfer.setData("text", "Hallo");
          // TODO: check if there is a better solution to hide the ghost image of the draggable object
          _dragevent.dataTransfer.setDragImage(new Image(), 0, 0);
          break;
      }
      let event: EventDragDrop = new EventDragDrop("ƒ" + _event.type, _dragevent);
      this.addCanvasPosition(event);
      this.dispatchEvent(event);
    }
    /**
     * Add position of the pointer mapped to canvas-coordinates as canvasX, canvasY to the event
     * @param event
     */
    private addCanvasPosition(event: EventPointer | EventDragDrop): void {
      event.canvasX = this.canvas.width * event.pointerX / event.clientRect.width;
      event.canvasY = this.canvas.height * event.pointerY / event.clientRect.height;
    }
    /**
     * Handle pointer events and dispatch to viewport as FUDGE-Event
     */
    private hndPointerEvent: EventListener = (_event: Event) => {
      let event: EventPointer = new EventPointer("ƒ" + _event.type, <EventPointer>_event);
      this.addCanvasPosition(event);
      this.dispatchEvent(event);
    }
    /**
     * Handle keyboard events and dispatch to viewport as FUDGE-Event, if the viewport has the focus
     */
    private hndKeyboardEvent: EventListener = (_event: Event) => {
      if (!this.hasFocus)
        return;
      let event: EventKeyboard = new EventKeyboard("ƒ" + _event.type, <EventKeyboard>_event);
      this.dispatchEvent(event);
    }
    /**
     * Handle wheel event and dispatch to viewport as FUDGE-Event
     */
    private hndWheelEvent: EventListener = (_event: Event) => {
      let event: EventWheel = new EventWheel("ƒ" + _event.type, <EventWheel>_event);
      this.dispatchEvent(event);
    }

    private activateEvent(_target: EventTarget, _type: string, _handler: EventListener, _on: boolean): void {
      _type = _type.slice(1); // chip the ƒlorin
      if (_on)
        _target.addEventListener(_type, _handler);
      else
        _target.removeEventListener(_type, _handler);
    }

    private hndComponentEvent(_event: Event): void {
      Debug.fudge(_event);
    }
    // #endregion
  }
}
