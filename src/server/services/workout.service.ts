import prisma from '../db.js';
import { CreateRoutineInput } from '../schemas/workout.schema.js';

export async function getCatalog() {
  return prisma.exercise.findMany({
    orderBy: { name: 'asc' }
  });
}

export async function getUserRoutines(userId: string) {
  return prisma.routine.findMany({
    where: { userId },
    include: {
      exercises: {
        include: { exercise: true },
        orderBy: { order: 'asc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function createRoutine(userId: string, data: CreateRoutineInput) {
  return prisma.routine.create({
    data: {
      name: data.name,
      userId,
      exercises: {
        create: data.exercises.map(ex => ({
          exerciseId: ex.exerciseId,
          order: ex.order,
          notes: ex.notes
        }))
      }
    },
    include: {
      exercises: { include: { exercise: true } }
    }
  });
}
