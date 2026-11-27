let sdkok = 0;

window["GD_OPTIONS"] = {
        "debug": false, // Enable debugging console. This will set a value in local storage as well, remove this value if you don't want debugging at all. You can also call it by running gdsdk.openConsole() within your browser console.
        "gameId": "ac793d41fb5845e59afaad6292e141e1", // Your gameId which is unique for each one of your games; can be found at your Gamedistribution.com account.
        "onEvent": function(event) {
			
            switch (event.name) {
                case "SDK_GAME_START":
					// advertisement done, resume game logic and unmute audio
					console.log('script: SDK game continue');
					if (c3_callFunction) c3_callFunction("afterAd");
					//runtime.globalThis.afterAd();
                    break;
					
				case "SDK_GAME_PAUSE":
					console.log('script: SDK pause');
					// pause game logic / mute audio
					if (c3_callFunction) c3_callFunction("gd_pause_game");
                    break;
					
				case "SDK_READY":
				// Oktobar 2023: U SDK novom uputstvu ovaj event vise nije ukljucen
						console.log('script: SDK ready');
						sdkok = 1;
						//if (c3_callFunction) c3_callFunction("gd_loaded_ok");
						
						break;
					
                case "SDK_ERROR":
				// Oktobar 2023: U SDK novom uputstvu ovaj event vise nije ukljucen
				
					console.log('script: SDK error');
					sdkok = 0;
					//if (c3_callFunction) c3_callFunction("adError");
                    break;
					
				case "AD_ERROR":
				// Oktobar 2023: U SDK novom uputstvu ovaj event vise nije ukljucen
				// Inace, njihov sistem tacno 6 puta trazi reklamu pre nego sto odustane. 
				// Kad god ne nadje reklamu, okida "AD_ERROR"
				// Zbog toga je opasno ovo koristiti u logici igre jer ovo nije konacan znak da reklame nema
				// Ovo se moze koristiti samo kao informacija i to nebitna.
				
					console.log('script: AD_ERROR');	
					// if (c3_callFunction) c3_callFunction("afterAd");
                    break;
					
				case "SDK_GDPR_TRACKING":
					// this event is triggered when your user doesn't want to be tracked
					break;
					
				case "SDK_GDPR_TARGETING":
					// this event is triggered when your user doesn't want personalised targeting of ads and such
					break;
					
				case "SDK_REWARDED_WATCH_COMPLETE":
					// this event is triggered when your user completely watched rewarded ad
					// Reward the player here. "giveReward"
					console.log('script: reward the player');
					if (c3_callFunction) c3_callFunction("rewardAdFinishedOk");
					
                break;
				
				case "CONTENT_PAUSE_REQUESTED":
					console.log('script: CONTENT_PAUSE_REQUESTED');
				break;
            }
        },
    };
	
    // L'adaptador local (gamedistribution-sdk.js) ja el carrega index.html
    // de forma sincrona abans d'aquest script: no cal injectar-lo aqui i aixi
    // no hi ha cap carrera entre la càrrega i les funcions del joc.
    console.log("GD init");
	
	//document.getElementById('adbutton').addEventListener('click', function(){ gdsdk.showBanner(); });
	//document.getElementById('consolebutton').addEventListener('click', function(){ gdsdk.openConsole(); });
    
globalThis.showAd = function() {
		console.log('script: Begin of commercial break');
		if (typeof gdsdk !== 'undefined' && gdsdk.showAd !== 'undefined' ) { // && sdkok ==1
			console.log('script: reklama je spremna');
			gdsdk.showAd();
		} else {
			console.log('script: show ad error');
			if(c3_callFunction) c3_callFunction("adError");
			
		}
	}
	
globalThis.preloadRewardAd = function() {
		if (gdsdk !== 'undefined' && gdsdk.preloadAd !== 'undefined' ) { //  && sdkok ==1
			gdsdk
				.preloadAd('rewarded')
				.then(response => {
				// A rewarded ad can be shown to user when he/she clicked it.
				console.log('script: reward ad preloaded OK -- ');
				if(c3_callFunction) c3_callFunction("rewardAdPreloadedOK");
				
			})
			.catch(error => {
				// Any Rewarded ad is not available to user. "rewardAdPreloadError"
				console.log('script: rewarded ad is not available, hide the reward button');
				if(c2_callFunction) c2_callFunction("rewardAdPreloadError");
				
			});
		}
	
	}
	
globalThis.showRewardAd=function() {
	// show reward ad
		if (gdsdk !== 'undefined' && gdsdk.showAd !== 'undefined') {
			console.log('script: try to show the reward ad');
			gdsdk.showAd('rewarded')
			.then(response => {
				// kompletiranost reward-a ne proveravam ovde, vec u event-ima gore
				console.log('script: reward ad ended, but, was it watched completely?');
			})
			.catch(error => {
				// An error catched. Please don't give reward here. "dontGiveReward"
				console.log('script: Reward ad error. Dont reward the player');
				// (c2_callFunction) c2_callFunction("rewardAdError");
				globalThis.rewardAdError();
			});
		} else {
			console.log('script: Reward ad error in the beginning. Dont reward the player.');
			// (c2_callFunction) c2_callFunction("rewardAdError");
			globalThis.rewardAdError();
		}
}