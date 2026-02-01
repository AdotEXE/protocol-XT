
    /**
     * Добавляет детали для самолета (Plane)
     */
    static addPlaneDetails(
        scene: Scene,
        chassis: Mesh,
        width: number,
        height: number,
        depth: number,
        color: import("@babylonjs/core").Color3,
        prefix: string = "preview"
    ): void {
        const darkColor = color.scale(0.7);
        const darkMat = new StandardMaterial(`${prefix}DarkMat`, scene);
        darkMat.diffuseColor = darkColor;
        darkMat.specularColor = new import("@babylonjs/core").Color3(0.2, 0.2, 0.2);

        // 1. Основные крылья (Delta wings)
        // Создаём треугольные крылья из боксов, повернутых под углом
        const wingSpan = width * 0.8;
        const wingChord = depth * 0.6;

        const leftWing = MeshBuilder.CreateBox(`${prefix}LeftWing`, {
            width: wingSpan,
            height: height * 0.1,
            depth: wingChord
        }, scene);
        // Смещаем и поворачиваем для формы дельта-крыла
        leftWing.parent = chassis;
        leftWing.position = new Vector3(-width * 0.4, 0, -depth * 0.1);
        leftWing.rotation.y = -Math.PI / 8;
        leftWing.material = darkMat;

        const rightWing = MeshBuilder.CreateBox(`${prefix}RightWing`, {
            width: wingSpan,
            height: height * 0.1,
            depth: wingChord
        }, scene);
        rightWing.parent = chassis;
        rightWing.position = new Vector3(width * 0.4, 0, -depth * 0.1);
        rightWing.rotation.y = Math.PI / 8;
        rightWing.material = darkMat;

        // 2. Хвостовое оперение (Vertical Stabilizer)
        const tailHeight = height * 0.8;
        const tailDepth = depth * 0.25;
        const tail = MeshBuilder.CreateBox(`${prefix}Tail`, {
            width: width * 0.05,
            height: tailHeight,
            depth: tailDepth
        }, scene);
        tail.parent = chassis;
        tail.position = new Vector3(0, height * 0.6, -depth * 0.4);
        // Небольшой наклон назад
        tail.rotation.x = -Math.PI / 6;
        tail.material = darkMat;

        // 3. Передние "утки" (Canards) - маленькие крылья спереди
        const canardSpan = width * 0.3;
        const canardChord = depth * 0.15;

        const leftCanard = MeshBuilder.CreateBox(`${prefix}LeftCanard`, {
            width: canardSpan,
            height: height * 0.05,
            depth: canardChord
        }, scene);
        leftCanard.parent = chassis;
        leftCanard.position = new Vector3(-width * 0.3, height * 0.1, depth * 0.35);
        leftCanard.material = darkMat;

        const rightCanard = MeshBuilder.CreateBox(`${prefix}RightCanard`, {
            width: canardSpan,
            height: height * 0.05,
            depth: canardChord
        }, scene);
        rightCanard.parent = chassis;
        rightCanard.position = new Vector3(width * 0.3, height * 0.1, depth * 0.35);
        rightCanard.material = darkMat;

        // 4. Двигатели (Turbines)
        const engineRadius = width * 0.1;
        const engineLength = depth * 0.4;

        const leftEngine = MeshBuilder.CreateCylinder(`${prefix}LeftTurbine`, {
            height: engineLength,
            diameter: engineRadius * 2,
            tessellation: 16
        }, scene);
        leftEngine.rotation.x = Math.PI / 2; // Поворачиваем цилиндр вдоль Z
        leftEngine.parent = chassis;
        leftEngine.position = new Vector3(-width * 0.2, height * 0.1, -depth * 0.3);
        leftEngine.material = MaterialFactory.createExhaustMaterial(scene, prefix); // Используем материал выхлопа для двигателей

        const rightEngine = MeshBuilder.CreateCylinder(`${prefix}RightTurbine`, {
            height: engineLength,
            diameter: engineRadius * 2,
            tessellation: 16
        }, scene);
        rightEngine.rotation.x = Math.PI / 2;
        rightEngine.parent = chassis;
        rightEngine.position = new Vector3(width * 0.2, height * 0.1, -depth * 0.3);
        rightEngine.material = MaterialFactory.createExhaustMaterial(scene, prefix);

        // 5. Кабина (Cockpit)
        const cockpit = MeshBuilder.CreateBox(`${prefix}Cockpit`, {
            width: width * 0.15,
            height: height * 0.2,
            depth: depth * 0.3
        }, scene);
        cockpit.parent = chassis;
        cockpit.position = new Vector3(0, height * 0.55, depth * 0.2);
        cockpit.material = MaterialFactory.createLensMaterial(scene, prefix); // Блестящий материал стекла
    }
