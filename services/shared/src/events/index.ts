import { z } from 'zod';

export const TodoCreatedEventSchema = z.object({
  todoId: z.string().min(1, 'todoId is required'),
  userId: z.string().min(1, 'userId is required'),
  userName: z.string().min(1, 'userName is required'),
  userEmail: z.string().email('Invalid email address in event payload'),
  title: z.string().min(1, 'title is required'),
  description: z.string().optional().default(''),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dueDate: z.union([z.string(), z.date()]).optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  correlationId: z.string().optional(),
});

export type TodoCreatedEvent = z.infer<typeof TodoCreatedEventSchema>;

export const QUEUES = {
  TODO_CREATED: 'todo_created',
  TODO_CREATED_DLQ: 'todo_created.dlq',
} as const;

export const EXCHANGES = {
  TODO_EVENTS: 'todo.events',
  DLX_TODO: 'dlx.todo',
} as const;
