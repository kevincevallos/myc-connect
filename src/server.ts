import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "./lib/prisma.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "../public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "MYC Connect API", version: "0.2.0" });
});

app.get("/api/dashboard", async (_req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalOrganizations,
      newLeadsThisMonth,
      activeOpportunities,
      openMatches,
      ecuadorToEurope,
      europeToEcuador,
      followUpsDue
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.opportunity.count({
        where: { stage: { notIn: ["CLIENT", "CLOSED", "NOT_INTERESTED", "NOT_QUALIFIED"] } }
      }),
      prisma.match.count({ where: { status: { not: "CLOSED" } } }),
      prisma.organization.count({ where: { direction: "ECUADOR_TO_EUROPE" } }),
      prisma.organization.count({ where: { direction: "EUROPE_TO_ECUADOR" } }),
      prisma.task.count({ where: { completed: false, dueDate: { lte: now } } })
    ]);

    res.json({
      totalOrganizations,
      newLeadsThisMonth,
      activeOpportunities,
      openMatches,
      ecuadorToEurope,
      europeToEcuador,
      followUpsDue
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo cargar el dashboard." });
  }
});

app.get("/api/organizations", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const country = String(req.query.country || "").trim();
    const direction = String(req.query.direction || "").trim();
    const sector = String(req.query.sector || "").trim();
    const pipelineStage = String(req.query.pipelineStage || "").trim();
    const strategicPotential = String(req.query.strategicPotential || "").trim();

    const where: any = {};

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { country: { contains: q, mode: "insensitive" } },
        { cityRegion: { contains: q, mode: "insensitive" } },
        { sector: { contains: q, mode: "insensitive" } },
        { subsector: { contains: q, mode: "insensitive" } },
        { offerSummary: { contains: q, mode: "insensitive" } }
      ];
    }

    if (country) where.country = { equals: country, mode: "insensitive" };
    if (direction) where.direction = direction;
    if (sector) where.sector = { equals: sector, mode: "insensitive" };
    if (pipelineStage) where.pipelineStage = pipelineStage;
    if (strategicPotential) where.strategicPotential = strategicPotential;

    const items = await prisma.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 250
    });

    res.json(items);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudieron cargar las organizaciones." });
  }
});

app.get("/api/organizations/:id", async (req, res) => {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: req.params.id },
      include: {
        contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }] },
        interactions: { orderBy: { date: "desc" }, take: 50 },
        opportunities: { orderBy: { createdAt: "desc" } },
        tasks: { orderBy: [{ completed: "asc" }, { dueDate: "asc" }] },
        matchesAsA: {
          include: { organizationB: true },
          orderBy: { createdAt: "desc" }
        },
        matchesAsB: {
          include: { organizationA: true },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!organization) {
      return res.status(404).json({ error: "Organización no encontrada." });
    }

    res.json(organization);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo cargar el perfil de la organización." });
  }
});

app.post("/api/organizations", async (req, res) => {
  try {
    const {
      name, organizationType, country, cityRegion, website, linkedin, instagram,
      direction, sector, subsector, offerSummary, needs = [], currentMarkets = [],
      targetMarkets = [], strategicPotential, leadSource, pipelineStage = "IDENTIFIED",
      nextAction, nextActionDate
    } = req.body;

    if (!name || !organizationType || !country || !direction || !sector) {
      return res.status(400).json({
        error: "Faltan campos obligatorios: nombre, tipo, país, dirección y sector."
      });
    }

    const duplicate = await prisma.organization.findUnique({
      where: { name_country: { name, country } }
    });

    if (duplicate) {
      return res.status(409).json({
        error: "Ya existe una organización con ese nombre y país."
      });
    }

    const organization = await prisma.organization.create({
      data: {
        name,
        organizationType,
        country,
        cityRegion: cityRegion || null,
        website: website || null,
        linkedin: linkedin || null,
        instagram: instagram || null,
        direction,
        sector,
        subsector: subsector || null,
        offerSummary: offerSummary || null,
        needs,
        currentMarkets,
        targetMarkets,
        strategicPotential: strategicPotential || null,
        leadSource: leadSource || null,
        pipelineStage,
        nextAction: nextAction || null,
        nextActionDate: nextActionDate ? new Date(nextActionDate) : null
      }
    });

    res.status(201).json(organization);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo crear la organización." });
  }
});

app.put("/api/organizations/:id", async (req, res) => {
  try {
    const existing = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Organización no encontrada." });

    const {
      name, organizationType, country, cityRegion, website, linkedin, instagram,
      direction, sector, subsector, offerSummary, needs = [], currentMarkets = [],
      targetMarkets = [], strategicPotential, leadSource, pipelineStage,
      nextAction, nextActionDate
    } = req.body;

    if (!name || !organizationType || !country || !direction || !sector) {
      return res.status(400).json({
        error: "Faltan campos obligatorios: nombre, tipo, país, dirección y sector."
      });
    }

    if (name !== existing.name || country !== existing.country) {
      const duplicate = await prisma.organization.findUnique({
        where: { name_country: { name, country } }
      });
      if (duplicate && duplicate.id !== existing.id) {
        return res.status(409).json({
          error: "Ya existe otra organización con ese nombre y país."
        });
      }
    }

    const updated = await prisma.organization.update({
      where: { id: req.params.id },
      data: {
        name,
        organizationType,
        country,
        cityRegion: cityRegion || null,
        website: website || null,
        linkedin: linkedin || null,
        instagram: instagram || null,
        direction,
        sector,
        subsector: subsector || null,
        offerSummary: offerSummary || null,
        needs,
        currentMarkets,
        targetMarkets,
        strategicPotential: strategicPotential || null,
        leadSource: leadSource || null,
        pipelineStage: pipelineStage || existing.pipelineStage,
        nextAction: nextAction || null,
        nextActionDate: nextActionDate ? new Date(nextActionDate) : null
      }
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo actualizar la organización." });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => {
  console.log(`MYC Connect funcionando en http://localhost:${PORT}`);
});
