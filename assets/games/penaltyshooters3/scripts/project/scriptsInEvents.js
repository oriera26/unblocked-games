import * as CANNON from './cannon-es.js'



const scriptsInEvents = {

	async Initevt_Event82_Act2(runtime, localVars)
	{
		globalThis.world = new CANNON.World();
		const world = globalThis.world;
		
		world.gravity.set(0, 0, -runtime.globalVars.Ge); // realno je 9.81m/s² ali kod mene mora vece
	},

	async Initevt_Event82_Act4(runtime, localVars)
	{
		const world = globalThis.world;
		
		globalThis.materijalTla = new CANNON.Material({});
		
		// Create a plane
		const groundBody = new CANNON.Body({
		    mass: 0, // mass == 0 makes the body static
			position: new CANNON.Vec3(0, 0, 0),
			material: materijalTla,
			shape: new CANNON.Plane()
		});
		groundBody.vrsta="tlo";
		//groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0) // make it face up
		
		world.addBody(groundBody);
		
	},

	async Initevt_Event82_Act9(runtime, localVars)
	{
		const world = globalThis.world
		const lopta = runtime.objects.lopta.getFirstInstance();
		
		globalThis.loptaMaterijal = new CANNON.Material({restitution:0.5});
		//loptaMaterijal = new CANNON.Material({restitution:0.6});
		
		const sphereBody = new CANNON.Body({
		   mass: runtime.globalVars.masaLopte, // realno je 0.5kg, ali...
		   //position: new CANNON.Vec3(lopta.x, lopta.y, lopta.z), // m
		   position: new CANNON.Vec3(0,0,0), //pozicija lopte se postavlja u akciji
		   material: globalThis.loptaMaterijal,
		   shape: new CANNON.Sphere(5) // r[m] inace, FIFA lopta ima poluprecnik 11cm, ali i ovde gledam size 3d objekta lopte a ne realne mere, otuda ova vrednost.
		   
		});
		
		//sphereBody.linearDamping=0.2;
		sphereBody.angularDamping=0.7;
		
		// TEST:
		//sphereBody.applyLocalImpulse({x:0,y:-150, z:58}, {x:0, y:0, z:0});
		
		// Add callback for ball colliding, call C3 function and take action
		sphereBody.addEventListener('collide', (e) => {
		  
		  //console.log("Vrsta: "+e.body.vrsta); // 'body' je telo sa kojim se nasa lopta sudarila
		  var vrsta = e.body.vrsta;
		  var ko_sutira = (runtime.globalVars.whoShoots=="player")?0:1;
		  //runtime.callFunction('ballCollide', vrsta);
		  if(vrsta=="tlo" | vrsta=="zid") runtime.callFunction('soundPlay','odbitak_lopte_od_zemlje',-10,'no');
		  if(vrsta=="okvir_gola") {
		  runtime.callFunction('publikaPromasaj'); 
		  runtime.callFunction('soundPlay','odbitak_lopte_od_stative',0,'no');
		  } 
		  if(vrsta=="mreza") {
		  	runtime.callFunction('soundPlay','mreza',0,'no');
		  	runtime.callFunction('tresiMrezu');
			//console.log("lopta udarila u mrezu "+e.body.id);
		  } 
		  if(vrsta=="golZona") 	{
		  // GOL!
			runtime.callFunction('golPostignut',ko_sutira); 
			//console.log("cannon-es: GOL!");
		}
		if(vrsta=="golmanKolajder") {
		runtime.callFunction('soundPlay','odbitak_lopte_od_zemlje',0,'no');
		runtime.callFunction('publikaPromasaj'); 
		}
		if(vrsta=="zid") {
			// jedan od kriterijuma za promasaj
			runtime.callFunction('soundPlay','odbitak_lopte_od_zemlje',0,'no');
			runtime.callFunction('publikaPromasaj'); 
			runtime.callFunction('golPromasen',ko_sutira);
			//console.log("lopta udarila u zid iza gola ili u powerup zid");
			// u svakom slucaju, sklanjam powerUpZid
			const powerUpZidC3 = runtime.objects.ZidPowerUp3D.getFirstInstance();
			powerUpZidC3.zElevation=-1100;
		}
		})
		
		world.addBody(sphereBody);
		//console.log("ID objekta sphereBody: "+sphereBody.id);
		// Associate cannonBody with 3DObject, so it tracks position and quaternion
		
		//lopta.setCannonBody(sphereBody, true) // ovo radimo u samoj akciji
		//inst.instVars.bodyId = sphereBody.id
	},

	async Initevt_Event82_Act11(runtime, localVars)
	{
		const world = globalThis.world
		
		// Create a plane
		const wallBody = new CANNON.Body({
		    mass: 0, // mass == 0 makes the body static
			position: new CANNON.Vec3(0, -95, 0),
			material: new CANNON.Material({restitution:0.05}),
			shape: new CANNON.Plane()
		});
		
		wallBody.vrsta="zid";
		
		wallBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0) // zarotirana za 90 stepeni
		
		world.addBody(wallBody);
	},

	async Initevt_Event82_Act13(runtime, localVars)
	{
		const world = globalThis.world;
		
		const radiusTop = 2;
		const radiusBottom = 2;
		const height = 114;
		const heightPrecke = 328;
		const numSegments = 12;
		const materijalStativa = new CANNON.Material({restitution:1});
		
		const cylinderShape = new CANNON.Cylinder(radiusTop, radiusBottom, height, numSegments);
		
		const stativa1 = new CANNON.Body({ 
			mass: 0, 
			position: new CANNON.Vec3(238, 25, height/2),
			material: materijalStativa,
			shape: cylinderShape
		});
		
		stativa1.vrsta="okvir_gola";
		
		// Bitno je imati u vidu da je cilindar, u cannon-es, poravnat sa Y-osom! Ovo je uradjeno da bi se ovaj shape uskladio sa cilindrom u Three.js.
		
		// Zato se stative moraju zarotirati za pi/2 oko x ose
		
		stativa1.quaternion.setFromEuler(Math.PI / 2, 0, 0);
		
		const stativa2 = new CANNON.Body({ 
			mass: 0, 
			position: new CANNON.Vec3(562, 25, height/2),
			material: materijalStativa,
			shape: cylinderShape
		});
		
		stativa2.vrsta="okvir_gola";
		
		stativa2.quaternion.setFromEuler(Math.PI / 2, 0, 0);
		
		const cylinderShape2 = new CANNON.Cylinder(radiusTop, radiusBottom, heightPrecke, numSegments);
		
		const precka = new CANNON.Body({ 
			mass: 0, 
			position: new CANNON.Vec3(400, 25, 112),
			material: materijalStativa,
			shape: cylinderShape2
		});
		
		precka.vrsta="okvir_gola";
		
		// precka je zarotirana za PI/2 oko ose Z:
		precka.quaternion.setFromEuler(0,0,Math.PI / 2);
			
		world.addBody(stativa1);
		world.addBody(stativa2);
		world.addBody(precka);
		
	},

	async Initevt_Event82_Act16(runtime, localVars)
	{
		const world = globalThis.world;
		const height = 110;
		
		const dubinaMaleMreze = 55/2;
		const debljinaMreze = 2;
		
		const materijalMreze = new CANNON.Material({});
		
		const boxShape = new CANNON.Box(new CANNON.Vec3(325/2, debljinaMreze, height/2));
		
		const velikaMreza = new CANNON.Body({ 
			mass: 0, 
			position: new CANNON.Vec3(400, -30, height/2),
			material: materijalMreze,
			shape: boxShape
		});
		
		velikaMreza.vrsta="mreza";
		
		world.addBody(velikaMreza);
		
		//-------------------------
		const malaMrezaShape = new CANNON.Box(new CANNON.Vec3(debljinaMreze, dubinaMaleMreze, height/2));
		
		const malaMreza1 = new CANNON.Body({ 
			mass: 0, 
			position: new CANNON.Vec3(238, -8, height/2),
			material: materijalMreze,
			shape: malaMrezaShape
		});
		
		const malaMreza2 = new CANNON.Body({ 
			mass: 0, 
			position: new CANNON.Vec3(562, -8, height/2),
			material: materijalMreze,
			shape: malaMrezaShape
		});
		
		malaMreza1.vrsta="mreza";
		malaMreza2.vrsta="mreza";
		
		world.addBody(malaMreza1);
		world.addBody(malaMreza2);
		
		const gornjaMrezaShape = new CANNON.Box(new CANNON.Vec3(325/2, dubinaMaleMreze, debljinaMreze));
		
		const gornjaMreza = new CANNON.Body({ 
			mass: 0, 
			position: new CANNON.Vec3(400, -8, 112),
			material: materijalMreze,
			shape: gornjaMrezaShape
		});
		
		gornjaMreza.vrsta="mreza";
		
		world.addBody(gornjaMreza);
		
		// Kontaktni materijali
		const lopta_mreza = new CANNON.ContactMaterial(globalThis.loptaMaterijal, materijalMreze, {friction:0, restitution:0});
		
		// Add contact material to the world
		world.addContactMaterial(lopta_mreza)
		
		// Kontaktni materijal lopta - tlo
		const lopta_tlo = new CANNON.ContactMaterial(globalThis.loptaMaterijal, globalThis.materijalTla, {friction:0.6, restitution:0.7});
		
		// Add contact material to the world
		world.addContactMaterial(lopta_tlo)
	},

	async Initevt_Event82_Act18(runtime, localVars)
	{
		const world = globalThis.world;
		const height = 100;
		
		const goalTriggerShape = new CANNON.Box(new CANNON.Vec3(318/2, 42/2, height/2)); // 10.10.23. sirina povecana sa 314 na 318
		
		const goalTrigger = new CANNON.Body({ 
			mass: 0, 
			position: new CANNON.Vec3(400, -3, height/2), // y pozicija promenjena sa -5 na -3
			shape: goalTriggerShape
		});
		
		goalTrigger.vrsta="golZona";
		// Set collisionResponse to false to make it a trigger
		goalTrigger.collisionResponse = false;
		
		world.addBody(goalTrigger);
		
		
		//console.log("World: "+world.bodies)
	},

	async Initevt_Event82_Act21(runtime, localVars)
	{
		const world = globalThis.world;
		for(let i=0; i<13; i++) {
			const goalieColliderBody = new CANNON.Body({
			
		   		mass: 0,
		   		position: new CANNON.Vec3(-1000,-1000,0), 				//pozicija kolajdera se postavlja u akciji u svakom osvezavanju
		   		shape: new CANNON.Sphere(15) //
		   
			});
			goalieColliderBody.vrsta="golmanKolajder";
		world.addBody(goalieColliderBody);
		}
		
		// kolajder powerup zid
		const height = 110;
		
		const boxShape = new CANNON.Box(new CANNON.Vec3(325/4, 3, height/2));
		
		const powerUpZid = new CANNON.Body({ 
			mass: 0, 
			position: new CANNON.Vec3(2000, 50, height/2),
			shape: boxShape
		});
		
		powerUpZid.vrsta="zid";
		
		world.addBody(powerUpZid);
	},

	async Snippetsevt_Event130_Act1(runtime, localVars)
	{
		window.CrazyGamesConstructSDK.game.gameplayStop();
	},

	async Snippetsevt_Event215_Act1(runtime, localVars)
	{
		window.CrazyGamesConstructSDK.game.happytime();
	},

	async Snippetsevt_Event217_Act1(runtime, localVars)
	{
		window.CrazyGamesConstructSDK.game.happytime();
	},

	async Snippetsevt_Event219_Act1(runtime, localVars)
	{
		window.CrazyGamesConstructSDK.game.happytime();
	},

	async Snippetsevt_Event221_Act1(runtime, localVars)
	{
		window.CrazyGamesConstructSDK.game.happytime();
	},

	async Snippetsevt_Event223_Act1(runtime, localVars)
	{
		window.CrazyGamesConstructSDK.game.happytime();
	},

	async Snippetsevt_Event225_Act1(runtime, localVars)
	{
		window.CrazyGamesConstructSDK.game.happytime();
	},

	async Snippetsevt_Event227_Act1(runtime, localVars)
	{
		window.CrazyGamesConstructSDK.game.happytime();
	},

	async Snippetsevt_Event229_Act1(runtime, localVars)
	{
		window.CrazyGamesConstructSDK.game.happytime();
	},

	async Snippetsevt_Event231_Act1(runtime, localVars)
	{
		window.CrazyGamesConstructSDK.game.happytime();
	},

	async Snippetsevt_Event233_Act1(runtime, localVars)
	{
		window.CrazyGamesConstructSDK.game.happytime();
	},

	async Snippetsevt_Event235_Act1(runtime, localVars)
	{
		window.CrazyGamesConstructSDK.game.happytime();
	},

	async Adevt_Event12_Act3(runtime, localVars)
	{
		await window.CrazyGamesConstructSDK.ad.requestAd("midgame");
	},

	async Akcijaps3evt_Event8_Act2(runtime, localVars)
	{
		const world = globalThis.world;
		const gkpColliderBody = world.bodies[11+localVars.loopindexJS];
		
		const newPosition = new CANNON.Vec3(runtime.globalVars.xT,runtime.globalVars.yT,runtime.globalVars.zT);
		
		// Update the body's position
		//gkpColliderBody.position.copy(newPosition);
		
		gkpColliderBody.position.set(runtime.globalVars.xT,runtime.globalVars.yT,runtime.globalVars.zT);
		
		//console.log(gkpColliderBody.position.x+", "+gkpColliderBody.vrsta);
	},

	async Akcijaps3evt_Event105_Act1(runtime, localVars)
	{
		window.CrazyGamesConstructSDK.game.gameplayStop();
	},

	async Akcijaps3evt_Event176_Act4(runtime, localVars)
	{
		const world = globalThis.world;
		
		//const ZidPowerUp_c3 = runtime.objects.ZidPowerUp3D.getFirstInstance();
		
		const powerUpZid = world.bodies[24];
		const currentPosition = powerUpZid.position;
		
		// Modify the x component of the position
		currentPosition.x = localVars.xZida;
		
		// Update the body's position
		powerUpZid.position.copy(currentPosition);
		
	},

	async Akcijaps3evt_Event381_Act1(runtime, localVars)
	{
		const world = globalThis.world;
		
		const lopta = runtime.objects.lopta.getFirstInstance();
		
		const sphereBody = world.bodies[1];
		sphereBody.linearDamping = 0.01;
		sphereBody.position.set(runtime.globalVars.xPoc, runtime.globalVars.yPoc, runtime.globalVars.zPoc); // 400, 407, 5.5 // 400,4,10
		sphereBody.velocity.set(0,0,0);
		sphereBody.angularVelocity.set(0,0,0);
		sphereBody.quaternion.set(0,0,0,1);
		//sphereBody.mass=runtime.globalVars.masaLopte;
		sphereBody.mass=0;
		
		lopta.setCannonBody(sphereBody, true);
		
		//console.log("ID objekta sphereBody: "+sphereBody.id);
		
		// sklanjanje powerUp zida, za slucaj da je bio aktivan
		
		const powerUpZid = world.bodies[24];
		const currentPosition = powerUpZid.position;
		
		// Modify the x component of the position
		currentPosition.x = 2000;
		
		// Update the body's position
		powerUpZid.position.copy(currentPosition);
	},

	async Akcijaps3evt_Event382_Act2(runtime, localVars)
	{
		const world = globalThis.world
		const fixedTimeStep = 1.0 / 60.0; // seconds
		const maxSubSteps = 3;
		
		world.step(fixedTimeStep, runtime.dt*2, maxSubSteps);
		
		// moja varijanta, bez fiksnog time step-a
		// ako se ovo koristi onda u uslovu mora every dt
		// a ne every tick inace ne radi uopste.
		// Edit 22.9: cudno, danas neko vreme radi donji kod kombinovan sa every tick a potom prestade da radi!
		//world.step(runtime.dt, runtime.dt*2, maxSubSteps);
		
		// Ipak, ovo gore je povremeno pravilo bag na iphone7 (igraci promasuju loptu) + je chatGPT predlozio da se ipak drzim fiksnog stepa. 
		
		// world.fixedStep(fixedTimeStep,maxSubSteps); // ovo radi presporo, mada tacno. Lopta leti duplo sporije > drugi parametar, vreme proteklo od posledenj provere, je kriticno za brzinu leta!
	},

	async Akcijaps3evt_Event397_Act1(runtime, localVars)
	{
		const lopta = globalThis.world.bodies[1];
		lopta.linearDamping = 0.5;
		lopta.velocity.set(0,0,0);
		
	},

	async Akcijaps3evt_Event424_Act1(runtime, localVars)
	{
		const world = globalThis.world;
		//world.gravity.set(0, 0, -40);
		//console.log(world.bodies[1]); // ovo je lopta. Ima li bolji nacin da se ovo identifikuje?
		const sphereBody = world.bodies[1];
		sphereBody.mass=runtime.globalVars.masaLopte; // 
		
		// applyImpulse bi trebalo da je jednostvniji od applyLocalImpulse jer ne zavisi od rotacije lopte ali ne znam zasto generise gresku 'r.cross is not a function'
		
		// primena lokalnog impulsa je ok ako se lopta pre suta postavi na pocetni polozaj, u mirovanju, sa rotacijom resetovanom na nulu. To je zato sto je i impuls izrazen lokalno.
		//sphereBody.applyLocalImpulse({x:localVars.impulsX, y:localVars.impulsY, z:localVars.impulsZ}, {x:0, y:0, z:0});
		
		sphereBody.applyImpulse({x:localVars.impulsX,y:localVars.impulsY, z:localVars.impulsZ}, {x:0, y:0, z:0}); //
		
		const suterovTarget = runtime.objects.TargetShutera3D.getFirstInstance();
		
	},

	async Akcijaps3evt_Event538_Act1(runtime, localVars)
	{
		window.CrazyGamesConstructSDK.game.gameplayStart();
	}

};

self.C3.ScriptsInEvents = scriptsInEvents;

