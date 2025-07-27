import { Router } from 'express';
import prisma from '../db';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Extend Request to include userId
interface AuthRequest extends Request {
  userId?: string;
}

// Get all projects for the authenticated user
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get a single project by ID
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (project.userId !== req.userId) {
      return res.status(403).json({ message: 'Forbidden: You do not own this project' });
    }

    res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create a new project
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const { name, description, mapData } = req.body;

  if (!name || !mapData) {
    return res.status(400).json({ message: 'Project name and map data are required' });
  }

  try {
    const project = await prisma.project.create({
      data: {
        name,
        description,
        mapData,
        userId: req.userId as string,
      },
    });
    res.status(201).json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update an existing project
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { name, description, mapData } = req.body;

  try {
    const existingProject = await prisma.project.findUnique({
      where: { id },
    });

    if (!existingProject) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (existingProject.userId !== req.userId) {
      return res.status(403).json({ message: 'Forbidden: You do not own this project' });
    }

    const updatedProject = await prisma.project.update({
      where: { id },
      data: {
        name: name ?? existingProject.name,
        description: description ?? existingProject.description,
        mapData: mapData ?? existingProject.mapData,
      },
    });
    res.json(updatedProject);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete a project
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const existingProject = await prisma.project.findUnique({
      where: { id },
    });

    if (!existingProject) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (existingProject.userId !== req.userId) {
      return res.status(403).json({ message: 'Forbidden: You do not own this project' });
    }

    await prisma.project.delete({
      where: { id },
    });
    res.status(204).send(); // No Content
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;