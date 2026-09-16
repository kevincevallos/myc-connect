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
  res.json({
    ok: true,
    service: "MYC Connect API",
    version: "0.1.0"
  });
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
        where: {
          stage: {
            notIn: ["CLIENT", "CLOSED", "NOT_INTERESTED", "NOT_QUALIFIED"]
          }
        }
      }),
      prisma.match.count({ where: { status: { not: "CLOSED" } } }),
      prisma.organization.count({ where: { direction: "ECUADOR_TO_EUROPE" } }),
      prisma.organization.count({ where: { direction: "EUROPE_TO_ECUADOR" } }),
      prisma.task.count({
        where: {
          completed: false,
          dueDate: { lte: now }
        }
      })
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

app.get("/api/organizations", async (_req, res) => {
  try {
    const items = await prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      take: 100
    });
    res.json(items);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudieron cargar las organizaciones." });
  }
});

app.post("/api/organizations", async (req, res) => {
  try {
    const {
      name,
      organizationType,
      country,
      cityRegion,
      website,
      linkedin,
      instagram,
      direction,
      sector,
      subsector,
      offerSummary,
      needs = [],
      currentMarkets = [],
      targetMarkets = [],
      strategicPotential,
      leadSource,
      pipelineStage = "IDENTIFIED",
      nextAction,
      nextActionDate
    } = req.body;

    if (!name || !organizationType || !country || !direction || !sector) {
      return res.status(400).json({
        error: "Faltan campos obligatorios: name, organizationType, country, direction y sector."
      });
    }

    const duplicate = await prisma.organization.findUnique({
      where: {
        name_country: {
          name,
          country
        }
      }
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

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => {
  console.log(`MYC Connect funcionando en http://localhost:${PORT}`);
});
