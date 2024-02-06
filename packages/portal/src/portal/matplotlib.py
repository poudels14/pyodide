from matplotlib.backends import backend_svg
from matplotlib import pyplot as plt
from matplotlib.backend_bases import _Backend
from portal_js.matplotlib import plot_filename


@_Backend.export
class _BackendPortal(_Backend):
    FigureCanvas = backend_svg.FigureCanvas
    FigureManager = backend_svg.FigureManager

    @staticmethod
    def show(*args, **kwargs):
        print("saving to ", plot_filename)
        plt.savefig(plot_filename)
