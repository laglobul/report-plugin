const Types = {
    api:       {
        url:    Symbol('report.api.url'),
        client: Symbol('report.api.client'),
    },
    factory:   {
        interactiveReport: Symbol('report.factory.interactiveReport'),
    },
    listener:  {
        webhook: Symbol('report.listener.webhook'),
    },
    webserver: Symbol('webserver'),
};

export default Types;
