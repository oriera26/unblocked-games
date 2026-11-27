

const scriptsInEvents = {

	async Snippetsevt_Event159_Act1(runtime, localVars)
	{
		const num = new Intl.NumberFormat('en-US', { style: 'decimal' }).format(localVars.brojZaFormatirati);
		
		runtime.setReturnValue(num);
	},

	async Loadingevt_Event2_Act1(runtime, localVars)
	{
		console.log = function () {};
	},

	async Loadingevt_Event4_Act1(runtime, localVars)
	{

	},

	async Loadingevt_Event10_Act1(runtime, localVars)
	{

	}
};

globalThis.C3.JavaScriptInEvents = scriptsInEvents;
