package fit.aquazero.app.feature.progress

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ChartMathTest {

    @Test
    fun `projection spreads points evenly and inverts the value axis`() {
        val points = ChartMath.project(
            values = listOf(80.0, 82.0, 84.0),
            goal = null,
            width = 300f,
            height = 100f,
            padding = 10f,
        )
        assertEquals(3, points.size)
        assertEquals(10f, points.first().x, 1e-3f)
        assertEquals(290f, points.last().x, 1e-3f)
        // Lowest value sits at the bottom of the usable band, highest at the top.
        assertEquals(90f, points.first().y, 1e-3f)
        assertEquals(10f, points.last().y, 1e-3f)
    }

    @Test
    fun `the goal line is kept inside the plotted range`() {
        val values = listOf(84.0, 83.0)
        val goalY = ChartMath.yFor(80.0, values, goal = 80.0, height = 100f, padding = 10f)
        val lowestY = ChartMath.yFor(83.0, values, goal = 80.0, height = 100f, padding = 10f)
        assertTrue("goal must render below the lowest weight point", goalY > lowestY)
        assertTrue(goalY <= 90f)
    }

    @Test
    fun `a flat series still renders instead of collapsing`() {
        val points = ChartMath.project(
            values = listOf(80.0, 80.0, 80.0),
            goal = null,
            width = 300f,
            height = 100f,
            padding = 10f,
        )
        assertTrue(points.all { it.y.isFinite() })
        assertEquals(points[0].y, points[2].y, 1e-6f)
    }

    @Test
    fun `a single point projects to the left edge without dividing by zero`() {
        val points = ChartMath.project(
            values = listOf(80.0),
            goal = null,
            width = 300f,
            height = 100f,
            padding = 10f,
        )
        assertEquals(1, points.size)
        assertEquals(10f, points.first().x, 1e-3f)
        assertTrue(points.first().y.isFinite())
    }

    @Test
    fun `an empty series projects to nothing`() {
        assertTrue(
            ChartMath.project(emptyList(), null, 300f, 100f, 10f).isEmpty(),
        )
    }

    @Test
    fun `Catmull-Rom control points match the web construction`() {
        val p0 = ChartMath.P(0f, 0f)
        val p1 = ChartMath.P(10f, 10f)
        val p2 = ChartMath.P(20f, 0f)
        val p3 = ChartMath.P(30f, 10f)
        val (c1, c2) = ChartMath.controlPoints(p0, p1, p2, p3)
        // c1 = p1 + (p2 - p0) / 6 ; c2 = p2 - (p3 - p1) / 6
        assertEquals(10f + 20f / 6f, c1.x, 1e-4f)
        assertEquals(10f + 0f / 6f, c1.y, 1e-4f)
        assertEquals(20f - 20f / 6f, c2.x, 1e-4f)
        assertEquals(0f - 0f / 6f, c2.y, 1e-4f)
    }
}
