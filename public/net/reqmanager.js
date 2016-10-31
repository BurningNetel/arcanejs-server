class ReqManager{
  	constructor( app ){
		this.app = app;
      	return this;
    }
    
    get( url, callback ){
      	let loadingBar = new LoadingBar();
      	
        var Httpreq = new XMLHttpRequest();
        Httpreq.open("GET",url,true);
        Httpreq.setRequestHeader("X-Csrf-Token", this.app.sessionManager.csrfToken);

        Httpreq.onload = (e) => {
          if (Httpreq.readyState === 4) {
              loadingBar.done();
              callback(Httpreq);
          }
        };

        Httpreq.onerror = function (e) {
        	console.error(xhr.statusText);
          	
          	loadingBar.done();
          	callback(null);
        };
		Httpreq.send(null);
    }

    post( url , data, callback){
      	let loadingBar = new LoadingBar();
      	console.log("post");
        let Httpreq = new XMLHttpRequest();
        Httpreq.open("POST", url ,true);
        Httpreq.setRequestHeader("X-Csrf-Token", this.app.sessionManager.csrfToken);
        Httpreq.setRequestHeader("Content-Type", "application/json");

         Httpreq.onload = (e) => {
          if (Httpreq.readyState === 4) {
              loadingBar.done();
              callback(Httpreq);
          }
        };
      
        Httpreq.onerror = (e) => {
        	console.error(xhr.statusText);
          	loadingBar.done();
          	callback(null);
        };     
      	Httpreq.send(JSON.stringify({data:data}));
    }
}