// Dumps decompiled C source for every function in the program.
// @category UCFighter
// @runtime Java

import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileOptions;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.util.task.ConsoleTaskMonitor;

import java.io.File;
import java.io.PrintWriter;
import java.io.FileWriter;
import java.io.BufferedWriter;

public class DumpDecompiled extends GhidraScript {
    @Override
    public void run() throws Exception {
        String outDir = System.getenv("UCF_OUT_DIR");
        if (outDir == null) outDir = "C:\\git\\UCFighter\\decompiled";
        File dir = new File(outDir);
        dir.mkdirs();

        DecompInterface decomp = new DecompInterface();
        DecompileOptions options = new DecompileOptions();
        decomp.setOptions(options);
        decomp.openProgram(currentProgram);

        FunctionIterator funcs = currentProgram.getFunctionManager().getFunctions(true);

        File allFile = new File(dir, "_all_functions.c");
        BufferedWriter allOut = new BufferedWriter(new FileWriter(allFile));

        File indexFile = new File(dir, "_function_index.txt");
        BufferedWriter indexOut = new BufferedWriter(new FileWriter(indexFile));

        int count = 0;
        int failed = 0;
        ConsoleTaskMonitor monitor = new ConsoleTaskMonitor();

        while (funcs.hasNext()) {
            Function fn = funcs.next();
            if (fn.isThunk() || fn.isExternal()) continue;
            String name = fn.getName();
            String addr = fn.getEntryPoint().toString();
            indexOut.write(addr + "\t" + name + "\t" + fn.getSignature() + "\n");

            try {
                DecompileResults res = decomp.decompileFunction(fn, 60, monitor);
                if (res != null && res.decompileCompleted() && res.getDecompiledFunction() != null) {
                    String c = res.getDecompiledFunction().getC();
                    allOut.write("// === " + name + " @ " + addr + " ===\n");
                    allOut.write(c);
                    allOut.write("\n");
                    count++;
                } else {
                    failed++;
                    allOut.write("// === " + name + " @ " + addr + " === [decompile FAILED]\n\n");
                }
            } catch (Exception e) {
                failed++;
                allOut.write("// === " + name + " @ " + addr + " === [exception: " + e.getMessage() + "]\n\n");
            }
            if (count % 50 == 0 && count > 0) {
                println("Decompiled " + count + " functions...");
                allOut.flush();
            }
        }

        allOut.close();
        indexOut.close();
        decomp.dispose();

        println("Done. Decompiled " + count + " functions (failed: " + failed + ")");
        println("Output: " + allFile.getAbsolutePath());
    }
}
