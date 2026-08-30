type Row = {
  id: string;
  whatsappAccountId: string;
  scope: string;
  idempotencyKey: string;
  requestHash: string;
  status: string;
  resultJson: string | null;
  errorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
};

const compoundKey = (accountId: string, scope: string, key: string): string =>
  `${accountId}:${scope}:${key}`;

export const memoryApiIdempotency = () => {
  const rows = new Map<string, Row>();
  let seq = 0;

  const byCompound = (where: {
    whatsappAccountId_scope_idempotencyKey?: {
      whatsappAccountId: string;
      scope: string;
      idempotencyKey: string;
    };
    id?: string;
  }): Row | null => {
    if (where.id) {
      return [...rows.values()].find((row) => row.id === where.id) ?? null;
    }
    const compound = where.whatsappAccountId_scope_idempotencyKey;
    if (!compound) return null;
    return (
      rows.get(compoundKey(compound.whatsappAccountId, compound.scope, compound.idempotencyKey)) ??
      null
    );
  };

  return {
    findUnique: jest.fn(async ({ where }: { where: Parameters<typeof byCompound>[0] }) =>
      byCompound(where),
    ),
    create: jest.fn(async ({ data }: { data: Omit<Row, 'id' | 'createdAt' | 'updatedAt'> }) => {
      const key = compoundKey(data.whatsappAccountId, data.scope, data.idempotencyKey);
      if (rows.has(key)) {
        const error = new Error('Unique constraint failed');
        Object.assign(error, { code: 'P2002' });
        throw error;
      }
      const row: Row = {
        ...data,
        id: `idem_${++seq}`,
        resultJson: data.resultJson ?? null,
        errorCode: data.errorCode ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rows.set(key, row);
      return row;
    }),
    updateMany: jest.fn(
      async ({ where, data }: { where: { id: string; status?: string }; data: Partial<Row> }) => {
        const row = [...rows.values()].find((item) => item.id === where.id);
        if (!row || (where.status && row.status !== where.status)) return { count: 0 };
        Object.assign(row, data, { updatedAt: data.updatedAt ?? new Date() });
        return { count: 1 };
      },
    ),
    deleteMany: jest.fn(
      async ({ where }: { where: { id?: string; expiresAt?: { lte: Date } } }) => {
        let count = 0;
        for (const [key, row] of rows) {
          if (where.id && row.id !== where.id) continue;
          if (where.expiresAt && row.expiresAt.getTime() > where.expiresAt.lte.getTime()) continue;
          rows.delete(key);
          count += 1;
        }
        return { count };
      },
    ),
  };
};
