export const tool = (toolName, args) => ({
  action: 'tool',
  toolName,
  arguments: args,
  message: '',
});
export const final = (message = 'Listo.') => ({
  action: 'final',
  toolName: null,
  arguments: {},
  message,
});
export function mockModel(sequence) {
  let index = 0;
  return {
    decide: async (messages) => {
      const item = sequence[index++];
      if (item instanceof Error) throw item;
      return typeof item === 'function' ? item(messages) : item;
    },
  };
}
