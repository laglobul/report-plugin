const Types = {
    report:  {
        api: {
            url:    Symbol('report.api.url'),
            client: Symbol('report.api.client'),
        },
        factory: {
            interactiveReport: Symbol('report.factory.interactiveReport'),
        },
    },
};

export default Types;
