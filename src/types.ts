const Types = {
    api:       {
        url:    Symbol('report.api.url'),
        client: Symbol('report.api.client'),
    },
    factory:   {
        interactiveReport: Symbol('report.factory.interactiveReport'),
    },
    webserver: Symbol('webserver'),
};

export default Types;
