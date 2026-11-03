import {tools} from '../tools/index.js';
import {AppError, errorResult} from '../errors.js';
import {throwIfCancelled, withCancellation} from './cancellation.js';

export async function executeTool(
    decision,
    {
        registry = tools, store, approval, logger = () => {
    }, signal
    },
) {
    try {
        throwIfCancelled(signal);

        if (!Object.hasOwn(registry, decision.toolName))
            throw new AppError('UNKNOWN_TOOL', 'Herramienta no permitida.');

        const tool = registry[decision.toolName];
        const parsed = tool.schema.safeParse(decision.arguments);

        if (!parsed.success)
            throw new AppError(
                'INVALID_ARGUMENTS',
                'Argumentos inválidos: revisa nombres, tipos, límites y campos adicionales.',
            );

        logger('APP', {tool: decision.toolName, validating: parsed.data});

        let authorization;

        if (tool.readOnly !== true) {
            if (decision.toolName !== 'createOrder')
                throw new AppError('UNKNOWN_MUTATION', 'Mutación sin protocolo de confirmación.');

            if (!approval?.request)
                throw new AppError(
                    'APPROVAL_REQUIRED',
                    'No hay un canal de confirmación humana disponible.',
                );

            const quote = store.prepareOrder(parsed.data);
            const response = await withCancellation(() => approval.request(quote), signal);
            throwIfCancelled(signal);
            authorization = store.confirmOrder(quote, response);

            if (!authorization)
                throw new AppError('APPROVAL_DENIED', 'El usuario no confirmó. La orden no fue creada.');
        }

        throwIfCancelled(signal);

        return {ok: true, data: await tool.execute(parsed.data, {store, authorization})};
    } catch (error) {
        return errorResult(error);
    }
}
